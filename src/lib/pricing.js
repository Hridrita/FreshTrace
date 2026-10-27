import { computeDecayPrice } from "@/lib/decay";

/**
 * Batch pricing.
 *
 * A batch's price is a *derived* value: it is the product's base price scaled
 * by the freshness multiplier of the batch's current tier. SRS §5.4 makes the
 * recomputation-on-read rule explicit — "every handler that returns a batch
 * or a list of batches runs `computeDecay` against `now` and uses the result.
 * The persisted `currentTier` is a cache."
 *
 * This module is the single place that turns a batch into a price. The
 * catalogue, the cart and the order service all go through it, so a customer
 * can never be quoted one price in the cart and another at checkout.
 */

/**
 * Compute the current price of a batch.
 *
 * @param {object} params
 * @param {Date} params.harvestDate the batch's harvest date (Dhaka midnight)
 * @param {number} params.baseUnitPrice the product's base price in BDT
 * @param {number} params.harvestToShelfDays the product's shelf life in days
 * @param {Date} [params.now] the instant to price against
 * @returns {{
 *   tier: import("@/lib/decay").Tier,
 *   multiplier: number,
 *   action: import("@/lib/decay").DecayAction,
 *   unitPrice: number,
 *   daysSinceHarvest: number,
 *   remainingShelfDays: number
 * }}
 */
export function priceBatch({ harvestDate, baseUnitPrice, harvestToShelfDays }, now = new Date()) {
  return computeDecayPrice(harvestDate, now, { baseUnitPrice, harvestToShelfDays });
}

/**
 * Round a line total to integer BDT.
 *
 * SRS §4.5: money is an integer number of BDT, never a float. A fractional
 * kilogram at a tier price can produce a fractional total, so the total is
 * rounded to the nearest taka — the same rounding the displayed unit price
 * already went through.
 *
 * @param {number} amount
 * @returns {number}
 */
export function toBDT(amount) {
  return Math.round(amount);
}
