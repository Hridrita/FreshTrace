/**
 * The freshness-decay constants the seed script shares with the app.
 *
 * The seed script runs under plain Node, so it cannot import the app's
 * `src/lib/decay/constants.js` — that module is ESM and uses the `@/` path
 * alias, neither of which plain Node resolves. Rather than copy the values
 * into the seed and hope they stay in step, they live here and the seed
 * requires them.
 *
 * `tests/decay-constants.test.js` pins these against the app's own
 * constants, so if the decay curve is ever retuned the test fails until
 * this file is updated with it.
 *
 * This file is CommonJS: `prisma/seed.js` is CommonJS too, because
 * `package.json` does not set `"type": "module"`.
 */

/** Milliseconds in a day. */
const MS_PER_DAY = 86_400_000;

/** Dhaka's fixed offset from UTC: +06:00. */
const DHAKA_OFFSET_MS = 6 * 3_600_000;

/**
 * The tier boundaries from the application's decay engine (SRS §5.1).
 *
 * @type {{ good: number, fair: number, nearExpiry: number }}
 */
const TIER_BOUNDARIES = { good: 2, fair: 4, nearExpiry: 6 };

/**
 * Read a multiplier from the environment, falling back to the documented
 * default when the variable is unset or not a valid number.
 *
 * @param {string} envKey
 * @param {number} fallback
 * @returns {number}
 */
function readMultiplier(envKey, fallback) {
  const raw = process.env[envKey];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}

/**
 * The price multipliers from the application's decay engine.
 *
 * The app reads these from the environment (SRS §16.6), so the seed reads
 * them the same way and honours an override.
 *
 * @returns {Record<string, number>}
 */
function getMultipliers() {
  return {
    fresh: readMultiplier("DECAY_DAY1_MULTIPLIER", 1.0),
    good: readMultiplier("DECAY_DAY3_MULTIPLIER", 0.8),
    fair: readMultiplier("DECAY_DAY5_MULTIPLIER", 0.6),
    near_expiry: readMultiplier("DECAY_NEAR_EXPIRY_MULTIPLIER", 0.3),
    expired: 0,
  };
}

/**
 * Map a day count onto a tier.
 *
 * This mirrors `resolveTier` in `src/lib/decay/index.js`: the expiry check
 * comes first, because a product whose shelf life is shorter than the
 * `near_expiry` band expires on the day after its shelf life ends rather
 * than sitting in a fixed tier band.
 *
 * @param {number} days
 * @param {number} shelfDays
 * @returns {"fresh" | "good" | "fair" | "near_expiry" | "expired"}
 */
function resolveTier(days, shelfDays) {
  if (days > shelfDays) return "expired";
  if (days < TIER_BOUNDARIES.good) return "fresh";
  if (days < TIER_BOUNDARIES.fair) return "good";
  if (days < TIER_BOUNDARIES.nearExpiry) return "fair";
  return "near_expiry";
}

module.exports = {
  MS_PER_DAY,
  DHAKA_OFFSET_MS,
  TIER_BOUNDARIES,
  getMultipliers,
  readMultiplier,
  resolveTier,
};
