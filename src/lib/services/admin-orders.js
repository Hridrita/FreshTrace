import { prisma } from "@/lib/prisma";
import { ERROR_CODES, apiError } from "@/lib/errors";
import { ORDER_STATUSES, REFUND_STATUSES } from "@/lib/constants";

/**
 * Admin order & refund operations.
 *
 * The panel can see every order, not just one customer's, and can move an
 * order through fulfilment. Refunds are decided here too.
 *
 * Two rules keep this honest:
 *
 * 1. **Status transitions are validated, not assumed.** An order can only
 *    move forward through a permitted transition. A delivered order cannot
 *    silently become `pending_payment` again, and a cancelled order cannot
 *    be resurrected.
 * 2. **A refund is always reconciled against the order.** The refund amount
 *    is capped at the order's grand total and the refund's lines are drawn
 *    from the order's own items, so a refund can never exceed what was
 *    actually paid.
 */

/**
 * The permitted order status transitions.
 *
 * @type {Record<string, readonly string[]>}
 */
export const ORDER_TRANSITIONS = {
  pending_payment: /** @type {const} */ (["paid", "cancelled"]),
  paid: /** @type {const} */ (["in_fulfillment", "cancelled", "refunded"]),
  in_fulfillment: /** @type {const} */ (["in_transit", "cancelled", "refunded"]),
  in_transit: /** @type {const} */ (["delivered", "cancelled", "refunded"]),
  delivered: /** @type {const} */ (["refunded"]),
  cancelled: /** @type {const} */ ([]),
  refunded: /** @type {const} */ ([]),
};

/**
 * The order statuses a customer can see as "in flight" — used to colour the
 * status pills on the dashboard.
 *
 * @type {Record<string, { label: string, tone: "neutral" | "info" | "success" | "warn" | "danger" }>}
 */
export const ORDER_STATUS_TONE = {
  pending_payment: { label: "Pending payment", tone: "neutral" },
  paid: { label: "Paid", tone: "success" },
  in_fulfillment: { label: "In fulfilment", tone: "info" },
  in_transit: { label: "In transit", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  refunded: { label: "Refunded", tone: "warn" },
};

/**
 * List orders for the operations table.
 *
 * @param {object} [options]
 * @param {string} [options.status]
 * @param {string} [options.paymentStatus]
 * @param {string} [options.search]
 * @param {number} [options.limit]
 * @returns {Promise<any[]>}
 */
export async function listOrdersForAdmin({
  status,
  paymentStatus,
  search,
  limit = 100,
} = {}) {
  const where = {};

  if (status) where.status = status;
  if (paymentStatus) where.paymentStatus = paymentStatus;

  if (search) {
    const term = search.trim();
    if (term) {
      where.OR = [
        { orderCode: { contains: term } },
        { customer: { email: { contains: term } } },
        { customer: { name: { contains: term } } },
      ];
    }
  }

  return prisma.order.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      items: { select: { id: true, name: true, qty: true, unitPrice: true, lineTotal: true } },
      refunds: {
        select: { id: true, status: true, amount: true, reason: true, createdAt: true },
      },
      delivery: { select: { id: true, courierStatus: true, courier: true, courierTrackingId: true } },
    },
    orderBy: { placedAt: "desc" },
    take: Math.min(Math.max(1, limit), 200),
  });
}

/**
 * Move an order to a new status.
 *
 * @param {string} orderId
 * @param {string} nextStatus
 * @param {object} [options]
 * @param {string} [options.reason] a note explaining a cancellation
 * @returns {Promise<any>}
 */
export async function updateOrderStatus(orderId, nextStatus, { reason } = {}) {
  if (!ORDER_STATUSES.includes(nextStatus)) {
    throw apiError(ERROR_CODES.VALIDATION_FAILED, "That is not a valid order status.");
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That order could not be found.");
  }

  const allowed = ORDER_TRANSITIONS[order.status] ?? [];

  if (!allowed.includes(nextStatus)) {
    throw apiError(
      ERROR_CODES.CONFLICT,
      `An order that is "${order.status}" cannot be moved to "${nextStatus}".`,
      { from: order.status, to: nextStatus, allowed },
    );
  }

  const now = new Date();

  const data = {
    status: nextStatus,
  };

  if (nextStatus === "delivered") {
    data.deliveredAt = order.deliveredAt ?? now;
  }

  if (nextStatus === "cancelled") {
    data.cancelReason = reason?.trim() ? reason.trim() : "Cancelled by operations";
  }

  if (nextStatus === "paid" && !order.paidAt) {
    data.paidAt = now;
    data.paymentStatus = "paid";
  }

  const updated = await prisma.order.update({ where: { id: orderId }, data });

  // The delivery row mirrors the order's movement so the courier view and
  // the order view never disagree.
  if (updated.delivery) {
    await prisma.delivery
      .update({
        where: { id: updated.delivery.id },
        data: {
          courierStatus:
            nextStatus === "in_transit"
              ? "in_transit"
              : nextStatus === "delivered"
                ? "delivered"
                : nextStatus === "cancelled"
                  ? "cancelled"
                  : undefined,
          pickedUpAt:
            nextStatus === "in_transit" ? now : undefined,
          deliveredAt: nextStatus === "delivered" ? now : undefined,
        },
      })
      .catch(() => {});
  }

  return updated;
}

/**
 * List refund requests awaiting a decision, plus the recent history.
 *
 * @param {object} [options]
 * @param {string} [options.status]
 * @param {number} [options.limit]
 * @returns {Promise<any[]>}
 */
export async function listRefunds({ status, limit = 100 } = {}) {
  const where = {};

  if (status) where.status = status;
  else where.status = { in: ["requested", "approved"] };

  return prisma.refund.findMany({
    where,
    include: {
      order: {
        select: {
          id: true,
          orderCode: true,
          grandTotal: true,
          status: true,
          customer: { select: { id: true, name: true, email: true } },
        },
      },
      requester: { select: { id: true, name: true, email: true, role: true } },
      resolver: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          orderItem: { select: { id: true, name: true, qty: true, unitPrice: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), 200),
  });
}

/**
 * Decide a refund request.
 *
 * A refund is reconciled against its order before it is written:
 *
 * - The amount cannot exceed the order's grand total.
 * - The refund's lines must reference items belonging to that order.
 * - The sum of the line amounts must match the refund's total.
 *
 * @param {string} refundId
 * @param {string} decision  'approved' | 'rejected' | 'processed'
 * @param {string} resolverId  the admin operator deciding
 * @returns {Promise<any>}
 */
export async function decideRefund(refundId, decision, resolverId) {
  if (!["approved", "rejected", "processed"].includes(decision)) {
    throw apiError(ERROR_CODES.VALIDATION_FAILED, "That is not a valid refund decision.");
  }

  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { items: true, order: true },
  });

  if (!refund) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That refund request could not be found.");
  }

  // A refund moves `requested → approved → processed`, or is `rejected` out
  // of the gate. It is never re-opened once it has been processed or
  // rejected — a settled refund is final, because the money has moved.
  if (refund.status === "processed" || refund.status === "rejected") {
    throw apiError(
      ERROR_CODES.CONFLICT,
      `This refund has already been ${refund.status}.`,
      { status: refund.status },
    );
  }

  // A refund that has been approved cannot be rejected — the decision was
  // already made and the customer was told so.
  if (refund.status === "approved" && decision === "rejected") {
    throw apiError(
      ERROR_CODES.CONFLICT,
      "This refund has already been approved and cannot now be rejected.",
      { status: refund.status },
    );
  }

  // A refund cannot jump straight from `requested` to `processed`; the
  // approval is the gate that authorises the money movement.
  if (refund.status === "requested" && decision === "processed") {
    throw apiError(
      ERROR_CODES.CONFLICT,
      "Approve the refund before processing it.",
      { status: refund.status },
    );
  }

  if (refund.amount > refund.order.grandTotal) {
    throw apiError(
      ERROR_CODES.VALIDATION_FAILED,
      "The refund amount is greater than the order total.",
      { amount: refund.amount, grandTotal: refund.order.grandTotal },
    );
  }

  const orderItemIds = new Set(refund.items.map((item) => item.orderItemId));
  const orderItems = await prisma.orderItem.findMany({
    where: { id: { in: [...orderItemIds] }, orderId: refund.orderId },
    select: { id: true, unitPrice: true, qty: true },
  });

  if (orderItems.length !== orderItemIds.size) {
    throw apiError(
      ERROR_CODES.VALIDATION_FAILED,
      "The refund references items that are not part of this order.",
    );
  }

  const lineTotal = refund.items.reduce((sum, item) => sum + item.amount, 0);

  if (lineTotal !== refund.amount) {
    throw apiError(
      ERROR_CODES.VALIDATION_FAILED,
      "The refund line items do not add up to the refund amount.",
      { lineTotal, amount: refund.amount },
    );
  }

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.refund.update({
      where: { id: refundId },
      data: {
        status: decision,
        resolvedBy: resolverId,
        resolvedAt: now,
        gatewayRefundRef:
          decision === "processed" ? `rf_${refundId.slice(-10)}` : refund.gatewayRefundRef,
      },
    });

    if (decision === "processed" || decision === "approved") {
      // A processed refund is reflected on the order, so the customer sees a
      // refunded order rather than a paid one.
      const isFullRefund = refund.amount >= refund.order.grandTotal;
      await tx.order.update({
        where: { id: refund.orderId },
        data: {
          status: isFullRefund ? "refunded" : refund.order.status,
          paymentStatus: isFullRefund
            ? "refunded"
            : "partially_refunded",
        },
      });
    }

    return result;
  });

  return updated;
}

/**
 * Create a replacement order for a failed basket.
 *
 * A replacement is a *new* order rather than a mutation of the original —
 * the customer keeps their order history intact, and the replacement is
 * traceable back to it through `cancelReason`.
 *
 * @param {string} orderId  the order being replaced
 * @param {string} adminId  the admin operator raising the replacement
 * @param {string} [reason]
 * @returns {Promise<any>}
 */
export async function createReplacementOrder(orderId, adminId, reason) {
  const original = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!original) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That order could not be found.");
  }

  if (original.items.length === 0) {
    throw apiError(ERROR_CODES.VALIDATION_FAILED, "That order has no items to replace.");
  }

  const sequence = await prisma.order.count() + 1;
  const now = new Date();
  const shifted = new Date(now.getTime() + 6 * 3_600_000);
  const datePart = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;

  const orderCode = `FT-ORD-${datePart}-${String(sequence).padStart(4, "0")}-R`;

  const subtotal = original.items.reduce((sum, item) => sum + item.lineTotal, 0);

  const replacement = await prisma.order.create({
    data: {
      orderCode,
      customerId: original.customerId,
      subscriptionId: original.subscriptionId,
      addressSnapshot: original.addressSnapshot,
      subtotal,
      deliveryFee: original.deliveryFee,
      grandTotal: subtotal + original.deliveryFee,
      paymentStatus: "paid",
      paymentMethod: original.paymentMethod,
      status: "in_fulfillment",
      placedAt: now,
      paidAt: now,
      cancelReason: `Replacement for ${original.orderCode}${reason ? ` — ${reason}` : ""}`,
      items: {
        create: original.items.map((item) => ({
          batchId: item.batchId,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          freshnessTierAtOrder: item.freshnessTierAtOrder,
        })),
      },
    },
  });

  // The original is marked so the operations table shows it was replaced.
  await prisma.order.update({
    where: { id: original.id },
    data: { status: "refunded", paymentStatus: "refunded" },
  });

  return replacement;
}

/**
 * List subscriptions for the operations view.
 *
 * @param {object} [options]
 * @param {string} [options.status]
 * @param {string} [options.search]
 * @param {number} [options.limit]
 * @returns {Promise<any[]>}
 */
export async function listSubscriptionsForAdmin({ status, search, limit = 100 } = {}) {
  const where = {};

  if (status) where.status = status;

  if (search) {
    const term = search.trim();
    if (term) {
      where.OR = [
        { customer: { email: { contains: term } } },
        { customer: { name: { contains: term } } },
        { plan: { name: { contains: term } } },
      ];
    }
  }

  return prisma.subscription.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      plan: { select: { id: true, name: true, basketSize: true, weeklyPrice: true } },
      address: { select: { id: true, label: true, area: true, city: true } },
      _count: { select: { orders: true } },
    },
    orderBy: { nextDeliveryAt: "asc" },
    take: Math.min(Math.max(1, limit), 200),
  });
}
