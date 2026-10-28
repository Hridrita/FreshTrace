import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  computeFreshnessAdjustment,
  tierForGrade,
  logQcInspection,
  recalculateBatchFreshness,
} from "@/lib/services/admin-qc";

/**
 * QC inspection logging and the freshness/pricing engine.
 *
 * Story 5's freshness rule: Day 1 @ 100%, Day 3 @ 80%, Day 5 @ 60%,
 * Day 7 delisted. The admin panel must price a batch with the *same* decay
 * engine the customer catalogue uses, so these tests pin the tier, the
 * multiplier and the resulting unit price.
 */

/**
 * A Date at midnight Dhaka time for a given UTC calendar date.
 *
 * @param {number} year
 * @param {number} month 1-based
 * @param {number} day
 * @returns {Date}
 */
function dhakaMidnight(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day) - 6 * 3_600_000);
}

describe("tierForGrade", () => {
  it("maps a grade A to the fresh tier", () => {
    expect(tierForGrade("A")).toBe("fresh");
  });

  it("caps a grade B at the fair tier", () => {
    expect(tierForGrade("B")).toBe("fair");
  });

  it("maps a grade C to expired", () => {
    expect(tierForGrade("C")).toBe("expired");
  });

  it("falls back to fair for an unknown grade", () => {
    expect(tierForGrade("Z")).toBe("fair");
  });
});

describe("computeFreshnessAdjustment", () => {
  const harvest = dhakaMidnight(2026, 10, 9);

  it("prices day 1 at 100% of the base price", () => {
    const result = computeFreshnessAdjustment({
      harvestDate: harvest,
      harvestToShelfDays: 7,
      baseUnitPrice: 100,
      referenceDate: dhakaMidnight(2026, 10, 10),
    });

    expect(result.tier).toBe("fresh");
    expect(result.multiplier).toBe(1.0);
    expect(result.unitPrice).toBe(100);
    expect(result.status).toBe("listed");
  });

  it("prices day 3 at 80% of the base price", () => {
    const result = computeFreshnessAdjustment({
      harvestDate: harvest,
      harvestToShelfDays: 7,
      baseUnitPrice: 100,
      referenceDate: dhakaMidnight(2026, 10, 12),
    });

    expect(result.tier).toBe("good");
    expect(result.multiplier).toBe(0.8);
    expect(result.unitPrice).toBe(80);
  });

  it("prices day 5 at 60% of the base price", () => {
    const result = computeFreshnessAdjustment({
      harvestDate: harvest,
      harvestToShelfDays: 7,
      baseUnitPrice: 100,
      referenceDate: dhakaMidnight(2026, 10, 14),
    });

    expect(result.tier).toBe("fair");
    expect(result.multiplier).toBe(0.6);
    expect(result.unitPrice).toBe(60);
  });

  it("marks day 7 near expiry when the shelf life is 7 days", () => {
    // SRS §5.1: `6 to harvestToShelfDays` is `near_expiry`; only days
    // *beyond* the shelf life are `expired`.
    const result = computeFreshnessAdjustment({
      harvestDate: harvest,
      harvestToShelfDays: 7,
      baseUnitPrice: 100,
      referenceDate: dhakaMidnight(2026, 10, 16),
    });

    expect(result.tier).toBe("near_expiry");
    expect(result.multiplier).toBe(0.3);
    expect(result.unitPrice).toBe(30);
    expect(result.status).toBe("listed");
    expect(result.action).toBe("list_with_warning");
  });

  it("delists once the shelf life is exceeded", () => {
    const result = computeFreshnessAdjustment({
      harvestDate: harvest,
      harvestToShelfDays: 7,
      baseUnitPrice: 100,
      referenceDate: dhakaMidnight(2026, 10, 17),
    });

    expect(result.tier).toBe("expired");
    expect(result.multiplier).toBe(0);
    expect(result.unitPrice).toBe(0);
    expect(result.status).toBe("delisted");
    expect(result.action).toBe("delist");
  });

  it("caps a grade B batch at the fair tier", () => {
    const result = computeFreshnessAdjustment({
      harvestDate: harvest,
      harvestToShelfDays: 7,
      baseUnitPrice: 100,
      referenceDate: dhakaMidnight(2026, 10, 10),
      grade: "B",
    });

    expect(result.tier).toBe("fair");
    expect(result.multiplier).toBe(0.6);
    expect(result.unitPrice).toBe(60);
  });

  it("expires a grade C batch regardless of age", () => {
    const result = computeFreshnessAdjustment({
      harvestDate: harvest,
      harvestToShelfDays: 7,
      baseUnitPrice: 100,
      referenceDate: dhakaMidnight(2026, 10, 10),
      grade: "C",
    });

    expect(result.tier).toBe("expired");
    expect(result.multiplier).toBe(0);
    expect(result.status).toBe("delisted");
  });

  it("never raises a tier through a grade cap", () => {
    // An already-aged batch keeps its own (worse) tier; a grade A cap must
    // not rejuvenate it.
    const result = computeFreshnessAdjustment({
      harvestDate: harvest,
      harvestToShelfDays: 7,
      baseUnitPrice: 100,
      referenceDate: dhakaMidnight(2026, 10, 14),
      grade: "A",
    });

    expect(result.tier).toBe("fair");
    expect(result.multiplier).toBe(0.6);
  });
});

describe("logQcInspection", () => {
  /** @type {any} */
  let product;
  /** @type {any} */
  let aggregator;
  /** @type {any} */
  let inspector;
  /** @type {any} */
  let batch;

  beforeEach(async () => {
    const suffix = Math.random().toString(36).slice(2, 8);

    aggregator = await prisma.user.create({
      data: {
        email: `agg-${suffix}@example.com`,
        passwordHash: "x",
        name: "Test Aggregator",
        role: "aggregator",
      },
    });

    inspector = await prisma.user.create({
      data: {
        email: `qc-${suffix}@example.com`,
        passwordHash: "x",
        name: "Test Inspector",
        role: "qc_staff",
      },
    });

    product = await prisma.product.create({
      data: {
        sku: `QC-TEST-${suffix}`,
        name: "Test Product",
        category: "fruit",
        baseUnitPrice: 100,
        harvestToShelfDays: 7,
      },
    });

    batch = await prisma.batch.create({
      data: {
        productId: product.id,
        aggregatorId: aggregator.id,
        batchCode: `FT-QC-${suffix}`,
        qrSlug: `qc-${suffix}`,
        // Harvested today, so the batch is inside its shelf life when the
        // inspection is logged "now".
        harvestDate: new Date(),
        originDistrict: "Bogura",
        inboundQty: 12,
        availableQty: 12,
        status: "in_transit",
      },
    });
  });

  it("records the inspection and re-prices the batch", async () => {
    const result = await logQcInspection(inspector.id, {
      batchId: batch.id,
      grade: "A",
      weightKg: 11.5,
      temperatureC: 8,
      notes: "Clean, no blemishes.",
      photos: ["https://example.com/a.jpg"],
    });

    expect(result.log.grade).toBe("A");
    expect(result.log.passed).toBe(true);
    expect(result.log.weightKg).toBe(11.5);
    expect(result.log.temperatureC).toBe(8);
    expect(result.batch.qcStatus).toBe("passed");
    expect(result.batch.status).toBe("listed");
    // The verified weight becomes the on-hand quantity.
    expect(result.batch.availableQty).toBe(11.5);
    expect(result.batch.currentTier).toBe("fresh");
    expect(result.batch.currentPriceMultiplier).toBe(1);
  });

  it("fails the inspection when the grade is C, even if passed is true", async () => {
    const result = await logQcInspection(inspector.id, {
      batchId: batch.id,
      grade: "C",
      weightKg: 11.5,
      passed: true,
    });

    expect(result.log.passed).toBe(false);
    expect(result.batch.qcStatus).toBe("failed");
    expect(result.batch.status).toBe("delisted");
    expect(result.batch.availableQty).toBe(0);
  });

  it("rejects an unknown grade", async () => {
    await expect(
      logQcInspection(inspector.id, {
        batchId: batch.id,
        grade: "Z",
        weightKg: 10,
      }),
    ).rejects.toThrow(/visual grade/i);
  });

  it("rejects a non-positive weight", async () => {
    await expect(
      logQcInspection(inspector.id, {
        batchId: batch.id,
        grade: "A",
        weightKg: 0,
      }),
    ).rejects.toThrow(/weight/i);
  });

  it("rejects an unknown batch", async () => {
    await expect(
      logQcInspection(inspector.id, {
        batchId: "does-not-exist",
        grade: "A",
        weightKg: 10,
      }),
    ).rejects.toThrow(/could not be found/i);
  });

  it("persists the inspection log", async () => {
    await logQcInspection(inspector.id, {
      batchId: batch.id,
      grade: "B",
      weightKg: 9,
      notes: "Minor marks.",
    });

    const logs = await prisma.batchQcLog.findMany({ where: { batchId: batch.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].grade).toBe("B");
    expect(logs[0].notes).toBe("Minor marks.");
  });
});

describe("recalculateBatchFreshness", () => {
  it("re-prices a batch from its harvest date and last QC timestamp", async () => {
    const suffix = Math.random().toString(36).slice(2, 8);

    const aggregator = await prisma.user.create({
      data: {
        email: `agg-${suffix}@example.com`,
        passwordHash: "x",
        role: "aggregator",
      },
    });

    const inspector = await prisma.user.create({
      data: {
        email: `qc-${suffix}@example.com`,
        passwordHash: "x",
        role: "qc_staff",
      },
    });

    const product = await prisma.product.create({
      data: {
        sku: `QC-RECALC-${suffix}`,
        name: "Recalc Product",
        category: "fruit",
        baseUnitPrice: 200,
        harvestToShelfDays: 7,
      },
    });

    const batch = await prisma.batch.create({
      data: {
        productId: product.id,
        aggregatorId: aggregator.id,
        batchCode: `FT-RECALC-${suffix}`,
        qrSlug: `recalc-${suffix}`,
        harvestDate: dhakaMidnight(2026, 10, 9),
        originDistrict: "Bogura",
        inboundQty: 10,
        availableQty: 10,
        status: "listed",
        qcStatus: "passed",
        currentTier: "fresh",
        currentPriceMultiplier: 1,
      },
    });

    // An inspection recorded on day 5 fixes the reference point.
    await prisma.batchQcLog.create({
      data: {
        batchId: batch.id,
        inspectorId: inspector.id,
        inspectedAt: dhakaMidnight(2026, 10, 14),
        grade: "A",
        weightKg: 10,
        passed: true,
      },
    });

    const result = await recalculateBatchFreshness(batch.id, dhakaMidnight(2026, 10, 20));

    expect(result.adjustment.tier).toBe("fair");
    expect(result.adjustment.multiplier).toBe(0.6);
    expect(result.adjustment.unitPrice).toBe(120);
    expect(result.batch.currentTier).toBe("fair");
    expect(result.batch.currentPriceMultiplier).toBe(0.6);
  });
});
