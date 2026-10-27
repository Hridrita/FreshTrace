import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  buildOrderCode,
  getOrder,
  listOrders,
  placeOrder,
} from "@/lib/services/orders";
import { addToCart } from "@/lib/services/cart";
import { validatePlaceOrderInput } from "@/lib/validation/cart";

/**
 * Integration tests for the order service.
 *
 * SRS §14.1: these run against a dedicated `dev.test.db` SQLite file with
 * migrations applied in `beforeAll`.
 *
 * The behaviours that matter most here are the atomicity guarantees from the
 * `order-and-checkout` spec: a line that cannot be satisfied fails the whole
 * order, and no stock is reserved on any line when it does.
 */

const DAY_MS = 86_400_000;

/**
 * Midnight Dhaka time, `daysAgo` days before now.
 * @param {number} daysAgo
 * @returns {Date}
 */
function daysAgoDhakaMidnight(daysAgo) {
  const now = new Date();
  const shifted = new Date(now.getTime() + 6 * 3_600_000);
  const midnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightUtc - 6 * 3_600_000 - daysAgo * DAY_MS);
}

let customer;
let otherCustomer;
let aggregator;
let product;
let address;
let batch;

/**
 * Create a batch for the test product.
 *
 * @param {object} [overrides]
 * @returns {Promise<import("@prisma/client").Batch>}
 */
async function makeBatch(overrides = {}) {
  return prisma.batch.create({
    data: {
      productId: product.id,
      aggregatorId: aggregator.id,
      batchCode: overrides.batchCode ?? `FT-ORD-${Math.random().toString(36).slice(2)}`,
      qrSlug: overrides.qrSlug ?? `slug-ord-${Math.random().toString(36).slice(2)}`,
      harvestDate: overrides.harvestDate ?? daysAgoDhakaMidnight(0),
      originDistrict: "Dhaka",
      inboundQty: 100,
      availableQty: overrides.availableQty ?? 50,
      status: overrides.status ?? "listed",
      qcStatus: "passed",
    },
  });
}

beforeAll(async () => {
  customer = await prisma.user.create({
    data: {
      email: "customer.orders@test.local",
      passwordHash: "x",
      name: "Order Customer",
      role: "customer",
    },
  });

  otherCustomer = await prisma.user.create({
    data: {
      email: "customer.orders2@test.local",
      passwordHash: "x",
      name: "Other Customer",
      role: "customer",
    },
  });

  aggregator = await prisma.user.create({
    data: {
      email: "agg.orders@test.local",
      passwordHash: "x",
      name: "Order Aggregator",
      role: "aggregator",
      companyName: "Order Farms",
    },
  });

  product = await prisma.product.create({
    data: {
      sku: "FR-ORD-TEST",
      name: "Order Test Mango",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice: 200,
      harvestToShelfDays: 7,
      isActive: true,
    },
  });

  address = await prisma.address.create({
    data: {
      userId: customer.id,
      label: "Home",
      line1: "House 12, Road 6",
      area: "Gulshan-2",
      city: "Dhaka",
      isDefault: true,
    },
  });
});

afterAll(async () => {
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.batchQcLog.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.address.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.batch.deleteMany();

  batch = await makeBatch();
});

describe("buildOrderCode", () => {
  it("formats the code with the Dhaka date and a sequence", () => {
    const code = buildOrderCode(new Date("2026-10-09T12:00:00Z"), 7);
    expect(code).toBe("FT-ORD-2026-10-09-0007");
  });

  it("uses the Dhaka calendar day, not the UTC one", () => {
    // 20:00 UTC on the 9th is already the 10th in Dhaka (UTC+06:00).
    const code = buildOrderCode(new Date("2026-10-09T20:00:00Z"), 1);
    expect(code).toBe("FT-ORD-2026-10-10-0001");
  });
});

describe("placeOrder", () => {
  it("creates an order in pending_payment", async () => {
    const order = await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 2 }],
      addressId: address.id,
      paymentMethod: "card",
    });

    expect(order.status).toBe("pending_payment");
    expect(order.paymentStatus).toBe("pending");
    expect(order.paymentMethod).toBe("card");
    expect(order.orderCode).toMatch(/^FT-ORD-\d{4}-\d{2}-\d{2}-\d{4}$/);
  });

  it("records an order line per item", async () => {
    const order = await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 2 }],
      addressId: address.id,
    });

    expect(order.items).toHaveLength(1);
    expect(order.items[0].name).toBe("Order Test Mango");
    expect(order.items[0].qty).toBe(2);
    expect(order.items[0].unitPrice).toBe(200);
    expect(order.items[0].lineTotal).toBe(400);
    expect(order.items[0].freshnessTierAtOrder).toBe("fresh");
  });

  it("reserves the stock", async () => {
    await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 3 }],
      addressId: address.id,
    });

    const reloaded = await prisma.batch.findUnique({ where: { id: batch.id } });
    expect(reloaded.availableQty).toBe(47);
  });

  it("reserves a fractional quantity", async () => {
    await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 1.5 }],
      addressId: address.id,
    });

    const reloaded = await prisma.batch.findUnique({ where: { id: batch.id } });
    expect(reloaded.availableQty).toBe(48.5);

    const order = await prisma.order.findFirst({ include: { items: true } });
    expect(order.items[0].qty).toBe(1.5);
  });

  it("adds the delivery fee to the total", async () => {
    const order = await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 1 }],
      addressId: address.id,
    });

    expect(order.subtotal).toBe(200);
    expect(order.deliveryFee).toBe(60);
    expect(order.grandTotal).toBe(260);
  });

  it("prices the line at the batch's tier discount", async () => {
    const aged = await makeBatch({
      harvestDate: daysAgoDhakaMidnight(3),
      availableQty: 20,
    });

    const order = await placeOrder(customer.id, {
      items: [{ batchId: aged.id, qty: 1 }],
      addressId: address.id,
    });

    expect(order.items[0].unitPrice).toBe(160); // 200 * 0.8
    expect(order.items[0].lineTotal).toBe(160);
    expect(order.items[0].freshnessTierAtOrder).toBe("good");
  });

  it("snapshots the delivery address", async () => {
    const order = await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 1 }],
      addressId: address.id,
    });

    const snapshot = JSON.parse(order.addressSnapshot);
    expect(snapshot.area).toBe("Gulshan-2");
    expect(snapshot.city).toBe("Dhaka");
  });

  it("keeps the snapshot when the address is edited afterwards", async () => {
    const order = await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 1 }],
      addressId: address.id,
    });

    await prisma.address.update({
      where: { id: address.id },
      data: { area: "Banani-11", line1: "House 99, Road 1" },
    });

    const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
    const snapshot = JSON.parse(reloaded.addressSnapshot);
    expect(snapshot.area).toBe("Gulshan-2");
    expect(snapshot.line1).toBe("House 12, Road 6");
  });

  it("rejects the whole order when one line has insufficient stock", async () => {
    const plenty = await makeBatch({ availableQty: 50 });
    const scarce = await makeBatch({ availableQty: 2 });

    await expect(
      placeOrder(customer.id, {
        items: [
          { batchId: plenty.id, qty: 1 },
          { batchId: scarce.id, qty: 5 },
        ],
        addressId: address.id,
      }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });

    // No order was created.
    expect(await prisma.order.count()).toBe(0);

    // And no stock was reserved on the line that could have been satisfied.
    const reloaded = await prisma.batch.findUnique({ where: { id: plenty.id } });
    expect(reloaded.availableQty).toBe(50);
  });

  it("rejects a batch that does not exist", async () => {
    await expect(
      placeOrder(customer.id, {
        items: [{ batchId: "does-not-exist", qty: 1 }],
        addressId: address.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    expect(await prisma.order.count()).toBe(0);
  });

  it("rejects a batch that is not listed", async () => {
    const delisted = await makeBatch({ status: "delisted" });

    await expect(
      placeOrder(customer.id, {
        items: [{ batchId: delisted.id, qty: 1 }],
        addressId: address.id,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("rejects a batch that has expired", async () => {
    const expired = await makeBatch({
      harvestDate: daysAgoDhakaMidnight(30),
      availableQty: 10,
    });

    await expect(
      placeOrder(customer.id, {
        items: [{ batchId: expired.id, qty: 1 }],
        addressId: address.id,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("rejects an address that belongs to somebody else", async () => {
    const otherAddress = await prisma.address.create({
      data: {
        userId: otherCustomer.id,
        label: "Home",
        line1: "House 1",
        area: "Dhanmondi",
        city: "Dhaka",
      },
    });

    await expect(
      placeOrder(customer.id, {
        items: [{ batchId: batch.id, qty: 1 }],
        addressId: otherAddress.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    await prisma.address.delete({ where: { id: otherAddress.id } });
  });

  it("rejects an order with no items", async () => {
    await expect(
      placeOrder(customer.id, { items: [], addressId: address.id }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("never lets the available quantity go negative", async () => {
    const scarce = await makeBatch({ availableQty: 1 });

    await placeOrder(customer.id, {
      items: [{ batchId: scarce.id, qty: 1 }],
      addressId: address.id,
    });

    const reloaded = await prisma.batch.findUnique({ where: { id: scarce.id } });
    expect(reloaded.availableQty).toBe(0);

    // A second order for the same batch cannot succeed.
    await expect(
      placeOrder(customer.id, {
        items: [{ batchId: scarce.id, qty: 1 }],
        addressId: address.id,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("removes the ordered lines from the cart", async () => {
    const other = await makeBatch({ availableQty: 20 });

    await addToCart(customer.id, batch.id, 1);
    await addToCart(customer.id, other.id, 1);

    await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 1 }],
      addressId: address.id,
    });

    const cart = await prisma.cartItem.findMany({ include: { batch: true } });
    expect(cart).toHaveLength(1);
    expect(cart[0].batchId).toBe(other.id);
  });

  it("gives each order a distinct code", async () => {
    const first = await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 1 }],
      addressId: address.id,
    });
    const second = await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 1 }],
      addressId: address.id,
    });

    expect(first.orderCode).not.toBe(second.orderCode);
  });
});

describe("listOrders", () => {
  it("returns only the customer's own orders, newest first", async () => {
    const otherAddress = await prisma.address.create({
      data: {
        userId: otherCustomer.id,
        label: "Home",
        line1: "House 1",
        area: "Dhanmondi",
        city: "Dhaka",
      },
    });

    const mine = await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 1 }],
      addressId: address.id,
    });

    const theirs = await placeOrder(otherCustomer.id, {
      items: [{ batchId: batch.id, qty: 1 }],
      addressId: otherAddress.id,
    });

    const orders = await listOrders(customer.id);
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(mine.id);
    expect(orders[0].id).not.toBe(theirs.id);

    await prisma.address.delete({ where: { id: otherAddress.id } });
  });

  it("filters by status", async () => {
    await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 1 }],
      addressId: address.id,
    });

    const pending = await listOrders(customer.id, { status: "pending_payment" });
    expect(pending).toHaveLength(1);

    const delivered = await listOrders(customer.id, { status: "delivered" });
    expect(delivered).toHaveLength(0);
  });
});

describe("getOrder", () => {
  it("returns the customer's own order", async () => {
    const order = await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 1 }],
      addressId: address.id,
    });

    const found = await getOrder(customer.id, order.id);
    expect(found.id).toBe(order.id);
    expect(found.items).toHaveLength(1);
  });

  it("reports another customer's order as not found", async () => {
    const order = await placeOrder(customer.id, {
      items: [{ batchId: batch.id, qty: 1 }],
      addressId: address.id,
    });

    await expect(getOrder(otherCustomer.id, order.id)).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("reports an unknown order as not found", async () => {
    await expect(getOrder(customer.id, "does-not-exist")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("order input validation", () => {
  it("accepts a valid order payload", () => {
    const result = validatePlaceOrderInput({
      items: [{ batchId: "abc", qty: 1 }],
      addressId: "def",
    });
    expect(result.success).toBe(true);
    expect(result.data.items).toHaveLength(1);
  });

  it("rejects an order with no items", () => {
    const result = validatePlaceOrderInput({ items: [], addressId: "def" });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.path === "items")).toBe(true);
  });

  it("rejects a missing address id", () => {
    const result = validatePlaceOrderInput({ items: [{ batchId: "abc", qty: 1 }] });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.path === "addressId")).toBe(true);
  });

  it("rejects a negative quantity", () => {
    const result = validatePlaceOrderInput({
      items: [{ batchId: "abc", qty: -1 }],
      addressId: "def",
    });
    expect(result.success).toBe(false);
  });

  it("rejects the same batch twice in one order", () => {
    const result = validatePlaceOrderInput({
      items: [
        { batchId: "abc", qty: 1 },
        { batchId: "abc", qty: 2 },
      ],
      addressId: "def",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a known payment method", () => {
    const result = validatePlaceOrderInput({
      items: [{ batchId: "abc", qty: 1 }],
      addressId: "def",
      paymentMethod: "cash_on_delivery",
    });
    expect(result.success).toBe(true);
    expect(result.data.paymentMethod).toBe("cash_on_delivery");
  });

  it("rejects an unknown payment method", () => {
    const result = validatePlaceOrderInput({
      items: [{ batchId: "abc", qty: 1 }],
      addressId: "def",
      paymentMethod: "carrier_pigeon",
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.path === "paymentMethod")).toBe(true);
  });
});
