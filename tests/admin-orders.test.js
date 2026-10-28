import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  ORDER_TRANSITIONS,
  decideRefund,
  listOrdersForAdmin,
  updateOrderStatus,
} from "@/lib/services/admin-orders";

/**
 * Order fulfilment and refund operations.
 *
 * The state machines are the point of these tests: an order may only move
 * along a permitted transition, and a refund is reconciled against its
 * order before any money is written.
 */

/**
 * @returns {Promise<{ customer: any, product: any, batch: any }>}
 */
async function makeFixtures() {
  const suffix = Math.random().toString(36).slice(2, 8);

  const customer = await prisma.user.create({
    data: {
      email: `cust-${suffix}@example.com`,
      passwordHash: "x",
      name: "Test Customer",
      role: "customer",
    },
  });

  const aggregator = await prisma.user.create({
    data: {
      email: `agg-${suffix}@example.com`,
      passwordHash: "x",
      role: "aggregator",
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: `admin-${suffix}@example.com`,
      passwordHash: "x",
      role: "admin",
    },
  });

  const product = await prisma.product.create({
    data: {
      sku: `OPS-${suffix}`,
      name: "Ops Product",
      category: "fruit",
      baseUnitPrice: 100,
      harvestToShelfDays: 7,
    },
  });

  const batch = await prisma.batch.create({
    data: {
      productId: product.id,
      aggregatorId: aggregator.id,
      batchCode: `FT-OPS-${suffix}`,
      qrSlug: `ops-${suffix}`,
      harvestDate: new Date(),
      originDistrict: "Bogura",
      inboundQty: 10,
      availableQty: 10,
      status: "listed",
    },
  });

  return { customer, aggregator, admin, product, batch };
}

/**
 * Create a paid order with one line.
 *
 * @param {any} customer
 * @param {any} batch
 * @returns {Promise<any>}
 */
async function makeOrder(customer, batch) {
  return prisma.order.create({
    data: {
      orderCode: `FT-ORD-TEST-${Math.random().toString(36).slice(2, 8)}`,
      customerId: customer.id,
      addressSnapshot: JSON.stringify({ area: "Gulshan-2", city: "Dhaka" }),
      subtotal: 200,
      deliveryFee: 60,
      grandTotal: 260,
      paymentStatus: "paid",
      paymentMethod: "card",
      status: "paid",
      items: {
        create: [
          {
            batchId: batch.id,
            name: "Ops Product",
            qty: 2,
            unitPrice: 100,
            lineTotal: 200,
            freshnessTierAtOrder: "fresh",
          },
        ],
      },
    },
    include: { items: true },
  });
}

describe("updateOrderStatus", () => {
  it("accepts a permitted transition", async () => {
    const { customer, batch } = await makeFixtures();
    const order = await makeOrder(customer, batch);

    const updated = await updateOrderStatus(order.id, "in_fulfillment");
    expect(updated.status).toBe("in_fulfillment");
  });

  it("rejects a transition the order cannot make", async () => {
    const { customer, batch } = await makeFixtures();
    const order = await makeOrder(customer, batch);

    // `paid` cannot jump straight to `delivered`.
    await expect(updateOrderStatus(order.id, "delivered")).rejects.toThrow(/cannot be moved/i);
  });

  it("rejects an unknown status", async () => {
    const { customer, batch } = await makeFixtures();
    const order = await makeOrder(customer, batch);

    await expect(updateOrderStatus(order.id, "teleported")).rejects.toThrow(/not a valid order status/i);
  });

  it("does not reopen a cancelled order", async () => {
    const { customer, batch } = await makeFixtures();
    const order = await makeOrder(customer, batch);

    await updateOrderStatus(order.id, "cancelled", { reason: "Test" });
    await expect(updateOrderStatus(order.id, "in_fulfillment")).rejects.toThrow(/cannot be moved/i);
  });

  it("records the cancellation reason", async () => {
    const { customer, batch } = await makeFixtures();
    const order = await makeOrder(customer, batch);

    const updated = await updateOrderStatus(order.id, "cancelled", { reason: "Damaged in transit" });
    expect(updated.cancelReason).toBe("Damaged in transit");
  });

  it("stamps the delivery date when an order is delivered", async () => {
    const { customer, batch } = await makeFixtures();
    const order = await makeOrder(customer, batch);

    await updateOrderStatus(order.id, "in_fulfillment");
    await updateOrderStatus(order.id, "in_transit");
    const updated = await updateOrderStatus(order.id, "delivered");

    expect(updated.deliveredAt).not.toBeNull();
  });

  it("rejects an unknown order", async () => {
    await expect(updateOrderStatus("does-not-exist", "in_fulfillment")).rejects.toThrow(
      /could not be found/i,
    );
  });
});

describe("decideRefund", () => {
  /**
   * @param {any} customer
   * @param {any} batch
   * @param {number} [amount]
   * @returns {Promise<any>}
   */
  async function makeRefund(customer, batch, amount = 200) {
    const order = await makeOrder(customer, batch);

    return prisma.refund.create({
      data: {
        orderId: order.id,
        requestedBy: customer.id,
        requestedByRole: "customer",
        reason: "Bruised on arrival.",
        amount,
        status: "requested",
        items: {
          create: [
            {
              orderItemId: order.items[0].id,
              qty: 2,
              amount,
            },
          ],
        },
      },
    });
  }

  it("approves a refund request", async () => {
    const { customer, batch, admin } = await makeFixtures();
    const refund = await makeRefund(customer, batch);

    const updated = await decideRefund(refund.id, "approved", admin.id);

    expect(updated.status).toBe("approved");
    expect(updated.resolvedBy).toBe(admin.id);
    expect(updated.resolvedAt).not.toBeNull();
  });

  it("refuses to process a refund that has not been approved", async () => {
    const { customer, batch, admin } = await makeFixtures();
    const refund = await makeRefund(customer, batch);

    await expect(decideRefund(refund.id, "processed", admin.id)).rejects.toThrow(
      /approve the refund/i,
    );
  });

  it("refuses to reject a refund that has already been approved", async () => {
    const { customer, batch, admin } = await makeFixtures();
    const refund = await makeRefund(customer, batch);

    await decideRefund(refund.id, "approved", admin.id);

    await expect(decideRefund(refund.id, "rejected", admin.id)).rejects.toThrow(
      /cannot now be rejected/i,
    );
  });

  it("refuses to re-decide a processed refund", async () => {
    const { customer, batch, admin } = await makeFixtures();
    const refund = await makeRefund(customer, batch);

    await decideRefund(refund.id, "approved", admin.id);
    await decideRefund(refund.id, "processed", admin.id);

    await expect(decideRefund(refund.id, "rejected", admin.id)).rejects.toThrow(
      /already been processed/i,
    );
  });

  it("refuses a refund larger than the order total", async () => {
    const { customer, batch, admin } = await makeFixtures();
    const refund = await makeRefund(customer, batch, 9999);

    await expect(decideRefund(refund.id, "approved", admin.id)).rejects.toThrow(
      /greater than the order total/i,
    );
  });

  it("refuses a refund whose lines do not add up to the total", async () => {
    const { customer, batch, admin } = await makeFixtures();
    const order = await makeOrder(customer, batch);

    const refund = await prisma.refund.create({
      data: {
        orderId: order.id,
        requestedBy: customer.id,
        requestedByRole: "customer",
        reason: "Bad total.",
        amount: 150,
        status: "requested",
        items: {
          create: [{ orderItemId: order.items[0].id, qty: 2, amount: 100 }],
        },
      },
    });

    await expect(decideRefund(refund.id, "approved", admin.id)).rejects.toThrow(
      /do not add up/i,
    );
  });

  it("refuses a refund that references another order's items", async () => {
    const { customer, batch, admin } = await makeFixtures();
    const order = await makeOrder(customer, batch);
    const otherOrder = await makeOrder(customer, batch);

    const refund = await prisma.refund.create({
      data: {
        orderId: order.id,
        requestedBy: customer.id,
        requestedByRole: "customer",
        reason: "Wrong item.",
        amount: 200,
        status: "requested",
        items: {
          create: [{ orderItemId: otherOrder.items[0].id, qty: 2, amount: 200 }],
        },
      },
    });

    await expect(decideRefund(refund.id, "approved", admin.id)).rejects.toThrow(
      /not part of this order/i,
    );
  });

  it("rejects an unknown decision", async () => {
    const { customer, batch, admin } = await makeFixtures();
    const refund = await makeRefund(customer, batch);

    await expect(decideRefund(refund.id, "maybe", admin.id)).rejects.toThrow(
      /not a valid refund decision/i,
    );
  });

  it("marks the order refunded when the whole order is refunded", async () => {
    const { customer, batch, admin } = await makeFixtures();
    const refund = await makeRefund(customer, batch, 260);

    await decideRefund(refund.id, "approved", admin.id);
    const processed = await decideRefund(refund.id, "processed", admin.id);

    expect(processed.status).toBe("processed");
    expect(processed.gatewayRefundRef).toBeTruthy();

    const order = await prisma.order.findUnique({ where: { id: refund.orderId } });
    expect(order.status).toBe("refunded");
    expect(order.paymentStatus).toBe("refunded");
  });
});

describe("listOrdersForAdmin", () => {
  it("returns orders across all customers, not just one", async () => {
    const { customer, batch } = await makeFixtures();
    await makeOrder(customer, batch);

    const orders = await listOrdersForAdmin({});
    expect(orders.length).toBeGreaterThan(0);
  });

  it("filters by status", async () => {
    const { customer, batch } = await makeFixtures();
    await makeOrder(customer, batch);

    const orders = await listOrdersForAdmin({ status: "paid" });
    expect(orders.every((order) => order.status === "paid")).toBe(true);
  });
});

describe("ORDER_TRANSITIONS", () => {
  it("makes a cancelled order terminal", () => {
    expect(ORDER_TRANSITIONS.cancelled).toEqual([]);
  });

  it("makes a refunded order terminal", () => {
    expect(ORDER_TRANSITIONS.refunded).toEqual([]);
  });

  it("does not allow a delivered order to be reopened", () => {
    expect(ORDER_TRANSITIONS.delivered).not.toContain("paid");
    expect(ORDER_TRANSITIONS.delivered).not.toContain("in_fulfillment");
  });
});
