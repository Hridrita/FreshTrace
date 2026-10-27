import { Validator, finish, requireEnum, requireInt, requireString } from "@/lib/validation/schema";
import { SUBSCRIPTION_STATUSES } from "@/lib/constants";

/**
 * Subscription input validation.
 *
 * SRS §6.5: every write path validates its input and returns the standard
 * `{ success, data }` / `{ success, errors }` result, so the caller reads
 * the same way whichever validator it uses.
 */

/**
 * The seven delivery weekdays, as `dayOfWeek` values.
 *
 * The schema stores `dayOfWeek` as `0 = Sunday … 6 = Saturday`, matching
 * JavaScript's `Date.getDay()`. The names are what the customer reads.
 */
export const WEEKDAY_NAMES = /** @type {const} */ ([
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]);

/**
 * Validate the body of a subscription creation request.
 *
 * Body: `{ planId, addressId, dayOfWeek }`.
 *
 * @param {unknown} body
 * @returns {import("@/lib/validation/schema").ValidationResult}
 */
export function validateCreateSubscriptionInput(body) {
  const v = new Validator();
  const input = /** @type {Record<string, unknown>} */ (body ?? {});

  const planId = requireString(v, input.planId, "planId", { min: 1, max: 64 });
  const addressId = requireString(v, input.addressId, "addressId", { min: 1, max: 64 });
  const dayOfWeek = requireInt(v, input.dayOfWeek, "dayOfWeek", { min: 0, max: 6 });

  return finish(v, { planId, addressId, dayOfWeek });
}

/**
 * Validate the body of a pause request.
 *
 * Body: `{ until }` — the date on which the pause ends.
 *
 * @param {unknown} body
 * @returns {import("@/lib/validation/schema").ValidationResult}
 */
export function validatePauseSubscriptionInput(body) {
  const v = new Validator();
  const input = /** @type {Record<string, unknown>} */ (body ?? {});

  // The pause-until date is a calendar date. A bare `YYYY-MM-DD` string is
  // accepted, as is a full ISO timestamp.
  const until = parseUntil(input.until);

  if (until === null) {
    v.add("until", "Must be a valid date.");
  }

  return finish(v, { until });
}

/**
 * Validate a status filter for a subscription list.
 *
 * @param {unknown} value
 * @returns {import("@/lib/validation/schema").ValidationResult}
 */
export function validateSubscriptionStatusFilter(value) {
  const v = new Validator();

  if (value === undefined || value === null || value === "") {
    return finish(v, { status: undefined });
  }

  const status = requireEnum(v, value, "status", SUBSCRIPTION_STATUSES);
  return finish(v, { status });
}

/**
 * Parse a pause-until date.
 *
 * A bare `YYYY-MM-DD` is read as midnight in the app timezone (Asia/Dhaka);
 * anything else is parsed as a full ISO timestamp. The return value is the
 * instant the pause ends.
 *
 * @param {unknown} value
 * @returns {Date | null}
 */
function parseUntil(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string" || value.trim() === "") return null;

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    // Dhaka is UTC+06:00 with no daylight saving, so midnight in Dhaka is
    // 18:00 UTC on the previous day.
    const parsed = new Date(`${trimmed}T00:00:00+06:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
