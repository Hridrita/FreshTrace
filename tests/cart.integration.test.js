import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  addToCart,
  clearCart,
  getCart,
  getOrCreateCart,
  removeFromCart,
  removeBatchesFromCart,
  updateCartItem,
} from "@/lib/services/cart";
import { validateAddToCartInput, validateUpdateCartItemInput } from "@/lib/validation/cart";

/**
 * Integration tests for the shopping cart service.
 *
 * SRS §14.1: these run against a dedicated `dev.test.db` SQLite file with
 * migrations applied in `beforeAll`.
 *
 * The cart's central rule is that it never stores a price — every line is
 * priced at read time from the batch's freshness tier. Several tests below
 * exist to prove that: a batch that ages while it sits in the cart must be
 * re-quoted.
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
let product;
let aggregator;
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
      batchCode: overrides.batchCode ?? `FT-CART-${Math.random().toString(36).slice(2)}`,
      qrSlug: overrides.qrSlug ?? `slug-cart-${Math.random().toString(36).slice(2)}`,
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
      email: "customer.cart@test.local",
      passwordHash: "x",
      name: "Cart Customer",
      role: "customer",
    },
  });

  aggregator = await prisma.user.create({
    data: {
      email: "agg.cart@test.local",
      passwordHash: "x",
      name: "Cart Aggregator",
      role: "aggregator",
      companyName: "Cart Farms",
    },
  });

  product = await prisma.product.create({
    data: {
      sku: "FR-CART-TEST",
      name: "Cart Test Mango",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice: 200,
      harvestToShelfDays: 7,
      isActive: true,
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
  await prisma.batch.deleteMany();

  batch = await makeBatch();
});

describe("getOrCreateCart", () => {
  it("creates a cart for a customer who has none", async () => {
    const cart = await getOrCreateCart(customer.id);
    expect(cart.userId).toBe(customer.id);
  });

  it("returns the same cart on a second call", async () => {
    const first = await getOrCreateCart(customer.id);
    const second = await getOrCreateCart(customer.id);
    expect(second.id).toBe(first.id);
  });
});

describe("addToCart", () => {
  it("adds a batch to an empty cart", async () => {
    const cart = await addToCart(customer.id, batch.id, 2);

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].batchId).toBe(batch.id);
    expect(cart.items[0].qty).toBe(2);
  });

  it("increases the existing line rather than creating a second one", async () => {
    await addToCart(customer.id, batch.id, 2);
    const cart = await addToCart(customer.id, batch.id, 3);

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].qty).toBe(5);
  });

  it("prices the line at the batch's current tier", async () => {
    // Harvested 3 days ago, so the tier is "good" and the multiplier is 0.8.
    const aged = await makeBatch({
      harvestDate: daysAgoDhakaMidnight(3),
      availableQty: 20,
    });

    const cart = await addToCart(customer.id, aged.id, 1);

    expect(cart.items[0].tier).toBe("good");
    expect(cart.items[0].unitPrice).toBe(160); // 200 * 0.8
    expect(cart.items[0].lineTotal).toBe(160);
  });

  it("re-prices the line when the batch ages while it sits in the cart", async () => {
    const aged = await makeBatch({
      harvestDate: daysAgoDhakaMidnight(2),
      availableQty: 20,
    });

    // The cart is read two days later, when the batch has moved from "good"
    // (0.8) into "fair" (0.6).
    const later = new Date(Date.now() + 2 * DAY_MS);
    const cart = await getCart(customer.id, later);

    expect(cart.items).toHaveLength(0); // nothing added yet

    await addToCart(customer.id, aged.id, 1, new Date());
    const repriced = await getCart(customer.id, later);

    expect(repriced.items[0].tier).toBe("fair");
    expect(repriced.items[0].unitPrice).toBe(120); // 200 * 0.6
  });

  it("rejects a batch that does not exist", async () => {
    await expect(addToCart(customer.id, "does-not-exist", 1)).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("rejects a batch that is not listed", async () => {
    const delisted = await makeBatch({ status: "delisted" });
    await expect(addToCart(customer.id, delisted.id, 1)).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    });
  });

  it("rejects a batch that has sold out", async () => {
    const soldOut = await makeBatch({ availableQty: 0 });
    await expect(addToCart(customer.id, soldOut.id, 1)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("rejects a batch that has expired", async () => {
    const expired = await makeBatch({
      harvestDate: daysAgoDhakaMidnight(30),
      availableQty: 10,
    });
    await expect(addToCart(customer.id, expired.id, 1)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("rejects a quantity beyond what the batch has", async () => {
    const small = await makeBatch({ availableQty: 3 });
    await expect(addToCart(customer.id, small.id, 5)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("rejects a second addition that would exceed the stock", async () => {
    const small = await makeBatch({ availableQty: 3 });
    await addToCart(customer.id, small.id, 2);

    await expect(addToCart(customer.id, small.id, 2)).rejects.toMatchObject({
      code: "conflict",
    });
  });
});

describe("getCart", () => {
  it("returns an empty cart for a customer who has never added anything", async () => {
    const cart = await getCart(customer.id);
    expect(cart.items).toHaveLength(0);
    expect(cart.subtotal).toBe(0);
    expect(cart.grandTotal).toBe(0);
  });

  it("adds the delivery fee only when there is something to buy", async () => {
    const cart = await getCart(customer.id);
    expect(cart.deliveryFee).toBe(0);

    await addToCart(customer.id, batch.id, 1);
    const withItems = await getCart(customer.id);
    expect(withItems.deliveryFee).toBe(60);
    expect(withItems.grandTotal).toBe(withItems.subtotal + 60);
  });

  it("excludes an unbuyable line from the subtotal but still lists it", async () => {
    const small = await makeBatch({ availableQty: 1 });
    await addToCart(customer.id, small.id, 1);

    // The batch sells out from under the cart.
    await prisma.batch.update({
      where: { id: small.id },
      data: { availableQty: 0, status: "sold_out" },
    });

    const cart = await getCart(customer.id);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].available).toBe(false);
    expect(cart.items[0].unavailableReason).toBeTruthy();
    expect(cart.subtotal).toBe(0);
  });

  it("marks a line whose requested quantity now exceeds the stock", async () => {
    const small = await makeBatch({ availableQty: 5 });
    await addToCart(customer.id, small.id, 4);

    await prisma.batch.update({
      where: { id: small.id },
      data: { availableQty: 2 },
    });

    const cart = await getCart(customer.id);
    expect(cart.items[0].available).toBe(false);
  });

  it("sums the subtotal across the lines", async () => {
    const other = await makeBatch({ availableQty: 20 });

    await addToCart(customer.id, batch.id, 2); // 200 * 2 = 400
    const cart = await addToCart(customer.id, other.id, 1); // 200 * 1 = 200

    expect(cart.subtotal).toBe(600);
    expect(cart.grandTotal).toBe(660);
  });
});

describe("updateCartItem", () => {
  it("sets a new quantity", async () => {
    await addToCart(customer.id, batch.id, 2);
    const cart = await updateCartItem(customer.id, batch.id, 5);

    expect(cart.items[0].qty).toBe(5);
  });

  it("removes the line when the quantity is zero", async () => {
    await addToCart(customer.id, batch.id, 2);
    const cart = await updateCartItem(customer.id, batch.id, 0);

    expect(cart.items).toHaveLength(0);
  });

  it("throws not_found for a batch that is not in the cart", async () => {
    await expect(updateCartItem(customer.id, batch.id, 2)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rejects a quantity beyond the available stock", async () => {
    const small = await makeBatch({ availableQty: 3 });
    await addToCart(customer.id, small.id, 1);

    await expect(updateCartItem(customer.id, small.id, 5)).rejects.toMatchObject({
      code: "conflict",
    });
  });
});

describe("removeFromCart", () => {
  it("removes the line", async () => {
    await addToCart(customer.id, batch.id, 2);
    const cart = await removeFromCart(customer.id, batch.id);

    expect(cart.items).toHaveLength(0);
  });

  it("throws not_found for a batch that is not in the cart", async () => {
    await expect(removeFromCart(customer.id, batch.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("clearCart", () => {
  it("empties the cart", async () => {
    await addToCart(customer.id, batch.id, 2);
    const other = await makeBatch({ availableQty: 20 });
    await addToCart(customer.id, other.id, 1);

    const cart = await clearCart(customer.id);
    expect(cart.items).toHaveLength(0);
  });
});

describe("removeBatchesFromCart", () => {
  it("removes only the named batches", async () => {
    const other = await makeBatch({ availableQty: 20 });

    await addToCart(customer.id, batch.id, 1);
    await addToCart(customer.id, other.id, 1);

    await removeBatchesFromCart(customer.id, [batch.id]);

    const cart = await getCart(customer.id);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].batchId).toBe(other.id);
  });

  it("is a no-op for a customer with no cart", async () => {
    const other = await prisma.user.create({
      data: {
        email: "customer.cart2@test.local",
        passwordHash: "x",
        name: "Other Customer",
        role: "customer",
      },
    });

    await expect(removeBatchesFromCart(other.id, [batch.id])).resolves.toBeUndefined();

    await prisma.user.delete({ where: { id: other.id } });
  });
});

describe("cart input validation", () => {
  it("accepts a valid add-to-cart payload", () => {
    const result = validateAddToCartInput({ batchId: "abc", qty: 1.5 });
    expect(result.success).toBe(true);
    expect(result.data.qty).toBe(1.5);
  });

  it("rejects a missing batch id", () => {
    const result = validateAddToCartInput({ qty: 1 });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.path === "batchId")).toBe(true);
  });

  it("rejects a negative quantity", () => {
    const result = validateAddToCartInput({ batchId: "abc", qty: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects a zero quantity on add", () => {
    const result = validateAddToCartInput({ batchId: "abc", qty: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts a zero quantity on update, which means remove", () => {
    const result = validateUpdateCartItemInput({ qty: 0 });
    expect(result.success).toBe(true);
    expect(result.data.qty).toBe(0);
  });
});
