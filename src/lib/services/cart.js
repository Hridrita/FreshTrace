import { prisma } from "@/lib/prisma";
import { ERROR_CODES, apiError } from "@/lib/errors";
import { DELIVERY_FEE } from "@/lib/constants";
import { priceBatch, toBDT } from "@/lib/pricing";

/**
 * Shopping cart service.
 *
 * A cart is a customer's staging area: the batches they intend to buy, at
 * the quantities they intend to buy them. It is not an order and it reserves
 * nothing — stock is only reserved when the order is placed.
 *
 * Three rules shape this module:
 *
 * 1. **Prices are never stored.** A cart line holds a `batchId` and a `qty`
 *    and nothing else. Every read recomputes the unit price from the batch's
 *    current freshness tier (SRS §5.4). A cart left open for a week therefore
 *    quotes today's price, not the price of the day it was filled.
 * 2. **A batch can appear once.** The `(cartId, batchId)` unique constraint
 *    means adding the same batch twice increases the existing line rather
 *    than creating a second one.
 * 3. **Unbuyable lines are reported, not hidden.** A batch that has been
 *    delisted, sold out or has since expired cannot be bought, but the
 *    customer should still see it in their cart with the reason — silently
 *    dropping it would make the cart total change underneath them.
 */

/**
 * @typedef {object} CartLine
 * @property {string} id the cart-item id
 * @property {string} batchId
 * @property {string} batchCode
 * @property {string} productName
 * @property {string} sku
 * @property {string} unit the product's unit of sale
 * @property {number} qty
 * @property {number} unitPrice the tier-discounted price, integer BDT
 * @property {number} lineTotal integer BDT
 * @property {string} tier the batch's current freshness tier
 * @property {string} freshnessTierAtCart
 * @property {number} availableQty the batch's remaining stock
 * @property {boolean} available whether the line can still be bought
 * @property {string | null} unavailableReason why the line cannot be bought
 * @property {string | null} harvestDate
 * @property {string | null} originDistrict
 * @property {string | null} imageUrl
 */

/**
 * @typedef {object} CartView
 * @property {string} id
 * @property {CartLine[]} items
 * @property {number} itemCount the number of distinct lines
 * @property {number} totalQty the sum of the line quantities
 * @property {number} subtotal integer BDT
 * @property {number} deliveryFee integer BDT
 * @property {number} grandTotal integer BDT
 */

/**
 * Fetch (or create) the cart for a user.
 *
 * The cart is created lazily on first use so that a customer who has never
 * added anything has no row to keep clean.
 *
 * @param {string} userId
 * @returns {Promise<import("@prisma/client").Cart>}
 */
export async function getOrCreateCart(userId) {
  const existing = await prisma.cart.findUnique({ where: { userId } });
  if (existing) return existing;

  return prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

/**
 * The number of lines in a user's cart.
 *
 * This is a *read-only* count: it never creates a cart. The customer shell
 * calls it on every page render to draw the badge, and rendering a page
 * should not write a row.
 *
 * @param {string | null | undefined} userId
 * @returns {Promise<number>}
 */
export async function getCartItemCount(userId) {
  if (!userId) return 0;

  const count = await prisma.cartItem.count({
    where: { cart: { userId } },
  });

  return count;
}

/**
 * Read a customer's cart, with every line priced and validated.
 *
 * @param {string} userId
 * @param {Date} [now]
 * @returns {Promise<CartView>}
 */
export async function getCart(userId, now = new Date()) {
  const cart = await getOrCreateCart(userId);

  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: {
      batch: {
        include: { product: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  /** @type {CartLine[]} */
  const lines = [];

  for (const item of items) {
    lines.push(buildLine(item, now));
  }

  const subtotal = lines
    .filter((line) => line.available)
    .reduce((sum, line) => sum + line.lineTotal, 0);

  const hasBuyableLines = lines.some((line) => line.available);

  return {
    id: cart.id,
    items: lines,
    itemCount: lines.length,
    totalQty: lines.reduce((sum, line) => sum + line.qty, 0),
    subtotal,
    deliveryFee: hasBuyableLines ? DELIVERY_FEE : 0,
    grandTotal: hasBuyableLines ? subtotal + DELIVERY_FEE : 0,
  };
}

/**
 * Build a single cart line, pricing it and working out whether it can still
 * be bought.
 *
 * @param {import("@prisma/client").CartItem & { batch: import("@prisma/client").Batch & { product: import("@prisma/client").Product } }} item
 * @param {Date} now
 * @returns {CartLine}
 */
function buildLine(item, now) {
  const { batch } = item;
  const product = batch.product;

  const pricing = priceBatch(
    {
      harvestDate: batch.harvestDate,
      baseUnitPrice: product.baseUnitPrice,
      harvestToShelfDays: product.harvestToShelfDays,
    },
    now,
  );

  const unitPrice = pricing.unitPrice;
  const lineTotal = toBDT(unitPrice * item.qty);

  const { available, reason } = checkAvailability({
    batch,
    tier: pricing.tier,
    qty: item.qty,
    unit: product.defaultUnit,
  });

  return {
    id: item.id,
    batchId: batch.id,
    batchCode: batch.batchCode,
    productName: product.name,
    sku: product.sku,
    unit: product.defaultUnit,
    qty: item.qty,
    unitPrice,
    lineTotal,
    tier: pricing.tier,
    freshnessTierAtCart: pricing.tier,
    availableQty: batch.availableQty,
    available,
    unavailableReason: reason,
    harvestDate: batch.harvestDate.toISOString(),
    originDistrict: batch.originDistrict,
    imageUrl: product.imageUrl,
  };
}

/**
 * Decide whether a cart line can still be bought, and say why if not.
 *
 * The checks mirror the ones the catalogue applies when listing buyable
 * batches: a batch must be `listed`, must have stock left, and must not have
 * decayed past its shelf life.
 *
 * @param {object} params
 * @param {import("@prisma/client").Batch} params.batch
 * @param {import("@/lib/decay").Tier} params.tier
 * @param {number} params.qty
 * @param {string} params.unit the product's unit of sale
 * @returns {{ available: boolean, reason: string | null }}
 */
function checkAvailability({ batch, tier, qty, unit }) {
  if (batch.status !== "listed") {
    return { available: false, reason: "This batch is no longer available." };
  }
  if (tier === "expired") {
    return { available: false, reason: "This batch has passed its shelf life." };
  }
  if (batch.availableQty <= 0) {
    return { available: false, reason: "This batch is sold out." };
  }
  if (qty > batch.availableQty) {
    return {
      available: false,
      reason: `Only ${batch.availableQty} ${unit} left in this batch.`,
    };
  }
  return { available: true, reason: null };
}

/**
 * Add a batch to the cart.
 *
 * Adding a batch that is already in the cart increases the quantity of the
 * existing line instead of creating a second one.
 *
 * The batch must exist, be `listed`, have stock, and not have expired. The
 * requested quantity is capped at what the batch actually has.
 *
 * @param {string} userId
 * @param {string} batchId
 * @param {number} qty
 * @param {Date} [now]
 * @returns {Promise<CartView>}
 */
export async function addToCart(userId, batchId, qty, now = new Date()) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { product: true },
  });

  if (!batch) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That batch could not be found.");
  }

  if (batch.status !== "listed") {
    throw apiError(ERROR_CODES.CONFLICT, "That batch is not available for purchase.");
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
    throw apiError(ERROR_CODES.CONFLICT, "That batch has passed its shelf life.");
  }

  if (batch.availableQty <= 0) {
    throw apiError(ERROR_CODES.CONFLICT, "That batch is sold out.");
  }

  const cart = await getOrCreateCart(userId);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_batchId: { cartId: cart.id, batchId } },
  });

  const requested = (existing?.qty ?? 0) + qty;

  if (requested > batch.availableQty) {
    throw apiError(
      ERROR_CODES.CONFLICT,
      `Only ${batch.availableQty} ${batch.product.defaultUnit} of this batch is available.`,
      { availableQty: batch.availableQty, requestedQty: requested },
    );
  }

  await prisma.cartItem.upsert({
    where: { cartId_batchId: { cartId: cart.id, batchId } },
    update: { qty: requested },
    create: { cartId: cart.id, batchId, qty },
  });

  return getCart(userId, now);
}

/**
 * Set the quantity of a cart line.
 *
 * A quantity of zero removes the line — that is the same as removing it
 * outright, and it keeps the client from needing a separate branch.
 *
 * @param {string} userId
 * @param {string} batchId
 * @param {number} qty
 * @param {Date} [now]
 * @returns {Promise<CartView>}
 */
export async function updateCartItem(userId, batchId, qty, now = new Date()) {
  const cart = await getOrCreateCart(userId);

  const existing = await prisma.cartItem.findUnique({
    where: { cartId_batchId: { cartId: cart.id, batchId } },
  });

  if (!existing) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That item is not in your cart.");
  }

  if (qty === 0) {
    await prisma.cartItem.delete({ where: { id: existing.id } });
    return getCart(userId, now);
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { product: true },
  });

  if (!batch) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That batch could not be found.");
  }

  if (qty > batch.availableQty) {
    throw apiError(
      ERROR_CODES.CONFLICT,
      `Only ${batch.availableQty} ${batch.product.defaultUnit} of this batch is available.`,
      { availableQty: batch.availableQty, requestedQty: qty },
    );
  }

  await prisma.cartItem.update({ where: { id: existing.id }, data: { qty } });

  return getCart(userId, now);
}

/**
 * Remove a line from the cart.
 *
 * @param {string} userId
 * @param {string} batchId
 * @param {Date} [now]
 * @returns {Promise<CartView>}
 */
export async function removeFromCart(userId, batchId, now = new Date()) {
  const cart = await getOrCreateCart(userId);

  const existing = await prisma.cartItem.findUnique({
    where: { cartId_batchId: { cartId: cart.id, batchId } },
  });

  if (!existing) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That item is not in your cart.");
  }

  await prisma.cartItem.delete({ where: { id: existing.id } });

  return getCart(userId, now);
}

/**
 * Empty the cart.
 *
 * @param {string} userId
 * @param {Date} [now]
 * @returns {Promise<CartView>}
 */
export async function clearCart(userId, now = new Date()) {
  const cart = await getOrCreateCart(userId);

  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

  return getCart(userId, now);
}

/**
 * Remove specific batches from a customer's cart.
 *
 * Used when an order is placed: the lines that made it into the order are
 * removed from the cart, while any line the customer could not buy (sold
 * out, delisted) stays put so it is still visible to them.
 *
 * @param {string} userId
 * @param {string[]} batchIds
 * @returns {Promise<void>}
 */
export async function removeBatchesFromCart(userId, batchIds) {
  if (batchIds.length === 0) return;

  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!cart) return;

  await prisma.cartItem.deleteMany({
    where: { cartId: cart.id, batchId: { in: batchIds } },
  });
}
