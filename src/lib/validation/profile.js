import { Validator, finish, requireString } from "@/lib/validation/schema";

/**
 * Profile validation.
 *
 * The account page lets a customer edit their **display name** and nothing
 * else. The email is the account's identity — changing it would need a
 * re-verification round trip that the app does not have — so it is read-only
 * here and the validator ignores it if it is sent.
 *
 * The name rule matches registration (`src/lib/validation/auth.js`): 2 to 120
 * characters once trimmed.
 */

/**
 * @typedef {object} ProfileInput
 * @property {string} name
 */

/**
 * Validate a profile update.
 *
 * @param {unknown} body
 * @returns {import("@/lib/validation/schema").ValidationResult}
 */
export function validateProfileInput(body) {
  const v = new Validator();
  const input = /** @type {Record<string, unknown>} */ (body ?? {});

  const name = requireString(v, input.name, "name", { min: 2, max: 120 });

  return finish(v, { name });
}
