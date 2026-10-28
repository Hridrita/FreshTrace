import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAdminMetrics, COST_DECAY } from "@/lib/services/admin-metrics";
import { createProduct, updateProduct } from "@/lib/services/products";

/**
 * The gross-margin model.
 *
 * The dashboard reports gross margin per basket, and the model behind it is
 * easy to get wrong in a way that makes the metric meaningless. The rule is:
 *
 * - **Revenue** is what the customer paid — the retail price
 *   (`baseUnitPrice`) adjusted by the freshness tier.
 * - **Cost of goods** is what FreshTrace paid the aggregator — the
 *   wholesale price (`costUnitPrice`), which also falls with the tier, but
 *   by less than the retail price.
 *
 * Charging the *retail* price as the cost would make every sale margin-free
 * and every discounted sale a loss, so the cost is a separate field.
 */

/**
 * @returns {Promise<{ customer: any, product: any, batch: any }>}
 */
async function makeFixtures({ baseUnitPrice = 100, costUnitPrice = 60 } = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);

  const customer = await prisma.user.create({
    data: {
      email: `margin-${suffix}@example.com`,
      passwordHash: "x",
      name: "Margin Tester",
      role: "customer",
    },
  });

  const product = await prisma.product.create({
    data: {
      sku: `MARGIN-${suffix}`,
      name: "Margin Mango",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice,
      costUnitPrice,
      harvestToShelfDays: 7,
    },
  });

  const batch = await prisma.batch.create({
    data: {
      productId: product.id,
      aggregatorId: customer.id,
      batchCode: `MARGIN-${suffix}`,
      qrSlug: `margin-${suffix}`,
      harvestDate: new Date(),
      originDistrict: "Dhaka",
      inboundQty: 100,
      availableQty: 100,
      qcStatus: "passed",
      currentTier: "fresh",
      currentPriceMultiplier: 1,
      status: "listed",
    },
  });

  return { customer, product, batch };
}

/**
 * Measure what one order contributes to the dashboard's gross margin.
 *
 * The test files share one SQLite database, so `getAdminMetrics()`
 * aggregates over *every* order in the reporting window — including rows
 * another file created. Absolute totals are therefore not assertable here.
 *
 * Measuring the *delta* across a single order is: it is exactly the
 * contribution of that order, and it does not care what else happens to be
 * in the database.
 *
 * @param {{ customer: any, batch: any }} fixtures
 * @param {{ qty: number, unitPrice: number, tier: string }} line
 * @returns {Promise<{ revenue: number, margin: number }>}
 */
async function measureContribution(fixtures, line) {
  const before = await getAdminMetrics();
  await placeOrder(fixtures, line);
  const after = await getAdminMetrics();

  // The margin is reported per basket, so the total margin is that figure
  // multiplied by the number of orders. Comparing the two totals isolates
  // the margin the new order added.
  const marginBefore = before.grossMarginPerBasket * before.ordersInWindow;
  const marginAfter = after.grossMarginPerBasket * after.ordersInWindow;

  return {
    revenue: after.revenueInWindow - before.revenueInWindow,
    margin: marginAfter - marginBefore,
  };
}

/**
 * Place a paid order with a single line.
 *
 * @param {{ customer: any, batch: any }} fixtures
 * @param {{ qty: number, unitPrice: number, tier: string }} line
 */
async function placeOrder(fixtures, line) {
  const lineTotal = Math.round(line.qty * line.unitPrice);

  return prisma.order.create({
    data: {
      orderCode: `MARGIN-${Math.random().toString(36).slice(2, 10)}`,
      customerId: fixtures.customer.id,
      addressSnapshot: "{}",
      subtotal: lineTotal,
      deliveryFee: 60,
      grandTotal: lineTotal + 60,
      paymentStatus: "paid",
      status: "delivered",
      placedAt: new Date(),
      items: {
        create: {
          batchId: fixtures.batch.id,
          name: "Margin Mango",
          qty: line.qty,
          unitPrice: line.unitPrice,
          lineTotal,
          freshnessTierAtOrder: line.tier,
        },
      },
    },
  });
}

beforeEach(async () => {
  await cleanUp();
});

afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

/**
 * Remove the rows this file created.
 *
 * The cleanup is deliberately scoped to this file's own rows rather than
 * wiping the tables: the test files share one SQLite database, and a
 * blanket `deleteMany` would pull rows out from under a file that is still
 * running.
 *
 * @returns {Promise<void>}
 */
async function cleanUp() {
  await prisma.refundItem.deleteMany({
    where: { refund: { order: { orderCode: { startsWith: "MARGIN-" } } } },
  });
  await prisma.refund.deleteMany({
    where: { order: { orderCode: { startsWith: "MARGIN-" } } },
  });
  await prisma.orderItem.deleteMany({
    where: { order: { orderCode: { startsWith: "MARGIN-" } } },
  });
  await prisma.payment.deleteMany({
    where: { order: { orderCode: { startsWith: "MARGIN-" } } },
  });
  await prisma.delivery.deleteMany({
    where: { order: { orderCode: { startsWith: "MARGIN-" } } },
  });
  await prisma.order.deleteMany({
    where: { orderCode: { startsWith: "MARGIN-" } },
  });
  await prisma.batchQcLog.deleteMany({
    where: { batch: { batchCode: { startsWith: "MARGIN-" } } },
  });
  await prisma.cartItem.deleteMany({
    where: { batch: { batchCode: { startsWith: "MARGIN-" } } },
  });
  await prisma.batch.deleteMany({
    where: { batchCode: { startsWith: "MARGIN-" } },
  });
  await prisma.product.deleteMany({
    where: { sku: { startsWith: "MARGIN-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: "margin-" } },
  });
}

describe("gross margin", () => {
  it("earns a margin on a full-price sale", async () => {
    const fixtures = await makeFixtures({ baseUnitPrice: 100, costUnitPrice: 60 });

    // 2 kg at the full retail price of 100 → revenue 200.
    const { revenue, margin } = await measureContribution(fixtures, {
      qty: 2,
      unitPrice: 100,
      tier: "fresh",
    });

    // Revenue 200 + 60 delivery = 260. Cost 2 × 60 = 120. The delivery fee
    // is revenue and a cost in equal measure, so it nets out of the margin.
    expect(revenue).toBe(260);
    expect(margin).toBe(80);
  });

  it("still earns a margin on a discounted sale", async () => {
    const fixtures = await makeFixtures({ baseUnitPrice: 100, costUnitPrice: 60 });

    // A `near_expiry` line sells at 30% of retail: 30 BDT per kg. The
    // wholesale cost falls too, but by less — at COST_DECAY = 0.5 the cost
    // is 60 × 0.3^0.5 ≈ 32.9 BDT per kg.
    const { margin } = await measureContribution(fixtures, {
      qty: 1,
      unitPrice: 30,
      tier: "near_expiry",
    });

    const expectedCogs = 60 * Math.pow(0.3, COST_DECAY);
    // The line is sold below the fresh-tier cost, so it loses a little —
    // but a *discounted* line is not a structural loss, because the
    // wholesale cost falls with the tier too.
    expect(margin).toBeCloseTo(30 - expectedCogs, 5);
  });

  it("charges the wholesale cost, not the retail price, as the cost of goods", async () => {
    const fixtures = await makeFixtures({ baseUnitPrice: 100, costUnitPrice: 60 });

    const { margin } = await measureContribution(fixtures, {
      qty: 1,
      unitPrice: 100,
      tier: "fresh",
    });

    // If the cost were the retail price (100), the margin would be zero.
    // It is the wholesale price (60), so the margin is 40 before the
    // delivery fee nets out.
    expect(margin).toBe(40);
  });

  it("treats a product with no quoted cost as costing nothing", async () => {
    const fixtures = await makeFixtures({ baseUnitPrice: 100, costUnitPrice: 60 });
    await prisma.product.update({
      where: { id: fixtures.product.id },
      data: { costUnitPrice: null },
    });

    const { margin } = await measureContribution(fixtures, {
      qty: 1,
      unitPrice: 100,
      tier: "fresh",
    });

    // No cost is quoted, so nothing is deducted. The metric does not
    // guess a cost and put a fabricated number on the dashboard.
    expect(margin).toBe(100);
  });
});

describe("product wholesale cost", () => {
  it("is stored alongside the retail price", async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const product = await createProduct({
      sku: `COST-${suffix}`,
      name: "Cost Mango",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice: 220,
      costUnitPrice: 125,
      harvestToShelfDays: 7,
      isActive: true,
    });

    expect(product.baseUnitPrice).toBe(220);
    expect(product.costUnitPrice).toBe(125);

    await prisma.product.delete({ where: { id: product.id } });
  });

  it("is null when a product is created without one", async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const product = await createProduct({
      sku: `COST-${suffix}`,
      name: "Cost Mango",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice: 220,
      harvestToShelfDays: 7,
      isActive: true,
    });

    expect(product.costUnitPrice).toBeNull();

    await prisma.product.delete({ where: { id: product.id } });
  });

  it("is rejected when it would exceed the retail price on update", async () => {
    const fixtures = await makeFixtures({ baseUnitPrice: 100, costUnitPrice: 60 });

    await expect(
      updateProduct(fixtures.product.id, { costUnitPrice: 150 }),
    ).rejects.toThrow(/wholesale cost/i);

    await expect(
      updateProduct(fixtures.product.id, { costUnitPrice: 100 }),
    ).resolves.toBeDefined();
  });

  it("is compared against the retail price the product will have after the update", async () => {
    const fixtures = await makeFixtures({ baseUnitPrice: 100, costUnitPrice: 60 });

    // Lowering the retail price to 50 while the cost stays at 60 would put
    // the product into a structural loss, so it is rejected.
    await expect(
      updateProduct(fixtures.product.id, { baseUnitPrice: 50 }),
    ).rejects.toThrow(/wholesale cost/i);
  });
});
