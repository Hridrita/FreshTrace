import { prisma } from "@/lib/prisma";
import { ERROR_CODES, apiError } from "@/lib/errors";
import { DELIVERY_FEE } from "@/lib/constants";
import { priceBatch, toBDT } from "@/lib/pricing";

/**
 * Order service.
 *
 * Placing an order is the one write path in the app that moves money and
 * stock at the same time, so it is the one write path that has to be
 * careful. The `order-and-checkout` spec sets the rules:
 *
 * 1. **Atomic stock reservation.** Every line's stock is decremented in a
 *    single transaction. If any line cannot be satisfied, the whole order
 *    fails and no stock is reserved — including on the lines that *could*
 *    have been satisfied.
 * 2. **The conditional decrement is the guard.** Each batch is decremented
 *    with `updateMany` guarded by `availableQty >= qty`. If the guard fails,
 *    the update matches zero rows and the transaction is rolled back. This
 *    is what makes a concurrent double-submit safe: the second order cannot
 *    reserve stock the first one already took, because the row it reads no
 *    longer satisfies the guard. The batch's `availableQty` can never go
 *    negative.
 * 3. **The price charged is the price shown.** The unit price is recomputed
 *    from the batch's tier at placement time and frozen onto the order line
 *    (SRS §4.5). Refunds later read that frozen price, never the product's
 *    current base price.
 * 4. **The address is a snapshot.** The delivery address is copied onto the
 *    order as JSON. Editing the saved address afterwards does not rewrite
 *    orders already placed.
 *
 * The order is created in `pending_payment`; moving it to `paid` belongs to
 * the mock-Stripe checkout, which is a later story.
 */

/**
 * @typedef {object} OrderLineInput
 * @property {string} batchId
 * @property {number} qty
 */

/**
 * @typedef {object} PlaceOrderInput
 * @property {OrderLineInput[]} items
 * @property {string} addressId
 * @property {string} [paymentMethod]
 */

/**
 * Build a human-readable order code, e.g. `FT-ORD-2026-10-09-0001`.
 *
 * The date part is the Dhaka calendar date the order was placed on, and the
 * sequence makes the code unique within the day.
 *
 * @param {Date} placedAt
 * @param {number} sequence
 * @returns {string}
 */
export function buildOrderCode(placedAt, sequence) {
  const shifted = new Date(placedAt.getTime() + 6 * 3_600_000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const serial = String(sequence).padStart(4, "0");

  return `FT-ORD-${year}-${month}-${day}-${serial}`;
}

/**
 * The next order-code sequence number for a given day.
 *
 * The count of orders already placed that day is the sequence, so codes run
 * `0001`, `0002`, … within a day. The order code is unique in the database,
 * and a collision (two orders placed in the same millisecond) is caught by
 * the `P2002` handler and reported as a conflict.
 *
 * @param {Date} placedAt
 * @returns {Promise<number>}
 */
async function nextOrderSequence(placedAt) {
  const dayStart = startOfDhakaDay(placedAt);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const count = await prisma.order.count({
    where: { placedAt: { gte: dayStart, lt: dayEnd } },
  });

  return count + 1;
}

/**
 * Midnight Dhaka time on the calendar day the given instant falls on.
 *
 * @param {Date} date
 * @returns {Date}
 */
function startOfDhakaDay(date) {
  const shifted = new Date(date.getTime() + 6 * 3_600_000);
  const midnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightUtc - 6 * 3_600_000);
}

/**
 * Place an order.
 *
 * The whole operation runs in one transaction. Stock is reserved by a
 * conditional `updateMany` per line; if any of them matches zero rows, the
 * transaction is rolled back and the order is rejected with a conflict
 * error. Nothing is written when the order fails.
 *
 * @param {string} customerId
 * @param {PlaceOrderInput} input
 * @param {Date} [now]
 * @returns {Promise<import("@prisma/client").Order & { items: import("@prisma/client").OrderItem[] }>}
 */
export async function placeOrder(customerId, input, now = new Date()) {
  const { items, addressId, paymentMethod } = input;

  if (!items || items.length === 0) {
    throw apiError(ERROR_CODES.VALIDATION_FAILED, "An order must contain at least one item.");
  }

  // ── The delivery address ───────────────────────────────────────────
  const address = await prisma.address.findUnique({ where: { id: addressId } });
  if (!address || address.userId !== customerId) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That delivery address could not be found.");
  }

  // ── Resolve and price every line ───────────────────────────────────
  const batchIds = items.map((item) => item.batchId);
  const batches = await prisma.batch.findMany({
    where: { id: { in: batchIds } },
    include: { product: true },
  });

  const batchesById = new Map(batches.map((batch) => [batch.id, batch]));

  /** @type {Array<{ batch: any, product: any, qty: number, unitPrice: number, lineTotal: number, tier: string }>} */
  const lines = [];

  for (const item of items) {
    const batch = batchesById.get(item.batchId);

    if (!batch) {
      throw apiError(ERROR_CODES.NOT_FOUND, "One of the batches in your order was not found.");
    }

    if (batch.status !== "listed") {
      throw apiError(
        ERROR_CODES.CONFLICT,
        `"${batch.product.name}" is no longer available for purchase.`,
        { batchId: batch.id },
      );
    }

    const pricing = priceBatch(
      {
        harvestDate: batch.harvestDate,
        baseUnitPrice: batch.product.baseUnitPrice,
        harvestToShelfDays: batch.product.harvestToShelfDays,
      },
      now,
    );

    if (pricing.tier === "expired") {
      throw apiError(
        ERROR_CODES.CONFLICT,
        `"${batch.product.name}" has passed its shelf life and can no longer be ordered.`,
        { batchId: batch.id },
      );
    }

    if (item.qty > batch.availableQty) {
      throw apiError(
        ERROR_CODES.CONFLICT,
        `Only ${batch.availableQty} ${batch.product.defaultUnit} of "${batch.product.name}" is available.`,
        { batchId: batch.id, availableQty: batch.availableQty, requestedQty: item.qty },
      );
    }

    lines.push({
      batch,
      product: batch.product,
      qty: item.qty,
      unitPrice: pricing.unitPrice,
      lineTotal: toBDT(pricing.unitPrice * item.qty),
      tier: pricing.tier,
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const deliveryFee = DELIVERY_FEE;
  const grandTotal = subtotal + deliveryFee;

  const orderCode = buildOrderCode(now, await nextOrderSequence(now));

  // The address is frozen onto the order. Later edits to the customer's
  // saved address do not reach orders that were already placed.
  const addressSnapshot = JSON.stringify({
    id: address.id,
    label: address.label,
    line1: address.line1,
    line2: address.line2,
    area: address.area,
    city: address.city,
    deliveryNotes: address.deliveryNotes,
  });

  // The transaction rolls back on any thrown error, so a stock conflict
  // raised below leaves the database exactly as it was.
  const order = await prisma.$transaction(async (tx) => {
    // Reserve the stock first. The `availableQty >= qty` guard is what
    // makes this safe under concurrency: a batch whose stock has already
    // been taken matches zero rows and the whole transaction rolls back.
    for (const line of lines) {
      const reserved = await tx.batch.updateMany({
        where: { id: line.batch.id, availableQty: { gte: line.qty } },
        data: { availableQty: { decrement: line.qty } },
      });

      if (reserved.count === 0) {
        throw apiError(
          ERROR_CODES.CONFLICT,
          `"${line.product.name}" just sold out. Nothing was ordered — please try again.`,
          { batchId: line.batch.id },
        );
      }
    }

    const created = await tx.order.create({
      data: {
        orderCode,
        customerId,
        addressSnapshot,
        subtotal,
        deliveryFee,
        grandTotal,
        paymentMethod: paymentMethod ?? null,
        status: "pending_payment",
        paymentStatus: "pending",
        placedAt: now,
        items: {
          create: lines.map((line) => ({
            batchId: line.batch.id,
            name: line.product.name,
            qty: line.qty,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            freshnessTierAtOrder: line.tier,
          })),
        },
      },
      include: { items: true },
    });

    // The ordered lines leave the cart. Any line that could not be bought
    // stays in the cart, so the customer can still see and remove it.
    const cart = await tx.cart.findUnique({
      where: { userId: customerId },
      select: { id: true },
    });

    if (cart) {
      await tx.cartItem.deleteMany({
        where: {
          cartId: cart.id,
          batchId: { in: lines.map((line) => line.batch.id) },
        },
      });
    }

    return created;
  });

  return order;
}

/**
 * List a customer's orders, newest first.
 *
 * @param {string} customerId
 * @param {object} [filters]
 * @param {string} [filters.status] restrict to one order status
 * @returns {Promise<import("@prisma/client").Order[]>}
 */
export async function listOrders(customerId, { status } = {}) {
  return prisma.order.findMany({
    where: {
      customerId,
      ...(status ? { status } : {}),
    },
    include: { items: true },
    orderBy: { placedAt: "desc" },
  });
}

/**
 * Fetch one of a customer's orders, with its lines.
 *
 * A customer can only ever see their own orders. An order belonging to
 * somebody else is reported as `not_found` rather than `forbidden` — telling
 * the caller that the order exists would leak the fact that it exists at all.
 *
 * @param {string} customerId
 * @param {string} orderId
 * @returns {Promise<import("@prisma/client").Order & { items: import("@prisma/client").OrderItem[] }>}
 */
export async function getOrder(customerId, orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order || order.customerId !== customerId) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That order could not be found.");
  }

  return order;
}
