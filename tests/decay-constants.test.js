import { describe, it, expect, afterEach } from "vitest";
import { getMultipliers, readMultiplier, TIER_BOUNDARIES } from "@/lib/decay/constants";
import { resolveTier as resolveTierInApp } from "@/lib/decay";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The seed script cannot import the app's decay constants directly — it runs
 * under plain Node, and the app's module is ESM with a `@/` path alias. So
 * the seed carries its own copy in `prisma/seed-constants.js`, and this
 * test is what keeps the two in step.
 */
const require = createRequire(import.meta.url);
const seedConstants = require(
  path.join(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    "prisma",
    "seed-constants.js",
  ),
);

/**
 * Decay multiplier configuration (SRS §16.6).
 *
 * The multipliers are env vars so the operations team can tune the decay
 * curve without a code deploy. The defaults match the SRS §5.1 tier table.
 */

const ENV_KEYS = [
  "DECAY_DAY1_MULTIPLIER",
  "DECAY_DAY3_MULTIPLIER",
  "DECAY_DAY5_MULTIPLIER",
  "DECAY_NEAR_EXPIRY_MULTIPLIER",
];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("getMultipliers", () => {
  it("returns the documented defaults", () => {
    expect(getMultipliers()).toEqual({
      fresh: 1.0,
      good: 0.8,
      fair: 0.6,
      near_expiry: 0.3,
      expired: 0,
    });
  });

  it("applies environment overrides", () => {
    process.env.DECAY_DAY3_MULTIPLIER = "0.75";
    expect(getMultipliers().good).toBe(0.75);
  });

  it("ignores an invalid override and uses the default", () => {
    process.env.DECAY_DAY3_MULTIPLIER = "not-a-number";
    expect(getMultipliers().good).toBe(0.8);
  });

  it("ignores an out-of-range override", () => {
    process.env.DECAY_NEAR_EXPIRY_MULTIPLIER = "5";
    expect(getMultipliers().near_expiry).toBe(0.3);
  });

  it("never lets the expired multiplier be non-zero", () => {
    expect(getMultipliers().expired).toBe(0);
  });
});

describe("readMultiplier", () => {
  it("returns the fallback for an unset variable", () => {
    expect(readMultiplier("DECAY_MISSING", 0.5)).toBe(0.5);
  });

  it("returns the fallback for an empty variable", () => {
    process.env.DECAY_TEST_MULTIPLIER = "";
    expect(readMultiplier("DECAY_TEST_MULTIPLIER", 0.5)).toBe(0.5);
  });

  it("parses a valid numeric string", () => {
    process.env.DECAY_TEST_MULTIPLIER = "0.42";
    expect(readMultiplier("DECAY_TEST_MULTIPLIER", 0.5)).toBe(0.42);
  });

  it("accepts zero", () => {
    process.env.DECAY_TEST_MULTIPLIER = "0";
    expect(readMultiplier("DECAY_TEST_MULTIPLIER", 0.5)).toBe(0);
  });

  it("rejects a negative value", () => {
    process.env.DECAY_TEST_MULTIPLIER = "-0.2";
    expect(readMultiplier("DECAY_TEST_MULTIPLIER", 0.5)).toBe(0.5);
  });

  it("rejects a value above one", () => {
    process.env.DECAY_TEST_MULTIPLIER = "1.5";
    expect(readMultiplier("DECAY_TEST_MULTIPLIER", 0.5)).toBe(0.5);
  });

  delete process.env.DECAY_TEST_MULTIPLIER;
});

/**
 * The seed script's copy of the decay constants.
 *
 * `prisma/seed.js` cannot import `src/lib/decay/constants.js` — it runs
 * under plain Node, and that module is ESM with a `@/` path alias. So the
 * seed keeps its own copy in `prisma/seed-constants.js`.
 *
 * These tests are what stops the two copies drifting apart. If the decay
 * curve is retuned in the app, they fail until the seed's copy is updated
 * with it — otherwise the seed would write batches whose stored tier
 * disagrees with the tier the app computes for them at read time.
 */
describe("seed-constants (the seed's copy of the decay constants)", () => {
  it("uses the same tier boundaries as the app", () => {
    expect(seedConstants.TIER_BOUNDARIES).toEqual(TIER_BOUNDARIES);
  });

  it("uses the same default multipliers as the app", () => {
    expect(seedConstants.getMultipliers()).toEqual(getMultipliers());
  });

  it("honours the same environment overrides as the app", () => {
    process.env.DECAY_DAY3_MULTIPLIER = "0.75";
    expect(seedConstants.getMultipliers().good).toBe(0.75);
    delete process.env.DECAY_DAY3_MULTIPLIER;
  });

  it("resolves tiers the same way as the app", () => {
    // The app's own resolver, reached through the pricing helper.
    const cases = [
      [0, 7],
      [1, 7],
      [2, 7],
      [3, 7],
      [4, 7],
      [5, 7],
      [6, 7],
      [7, 7],
      [8, 7],
    ];

    for (const [days, shelfDays] of cases) {
      expect(seedConstants.resolveTier(days, shelfDays)).toBe(
        resolveTierInApp(days, shelfDays),
      );
    }
  });
});
