import {
  Validator,
  finish,
  optionalString,
  requireString,
} from "@/lib/validation/schema";

/**
 * Delivery address input validation.
 *
 * The house pattern (SRS §2.4) is a `Validator` that accumulates issues, the
 * primitives that mutate it, and `finish` that turns the run into a
 * `{ success, data }` / `{ success, errors }` result.
 *
 * The checkout quick-form is deliberately forgiving about the optional
 * fields — a customer typing their address on a phone should not be blocked
 * by a missing flat number — but the fields the courier actually needs
 * (the street line and the area) are required.
 */

/**
 * @typedef {object} AddressInput
 * @property {string} label
 * @property {string} line1
 * @property {string} [line2]
 * @property {string} area
 * @property {string} [city]
 * @property {string} [deliveryNotes]
 */

/**
 * Validate a delivery address.
 *
 * @param {unknown} body
 * @returns {import("@/lib/validation/schema").ValidationResult<AddressInput>}
 */
export function validateAddressInput(body) {
  const v = new Validator();
  const input = /** @type {Record<string, unknown>} */ (body ?? {});

  // A blank label is fine — the service falls back to "Home".
  const label =
    input.label === undefined || input.label === null
      ? "Home"
      : requireString(v, input.label, "label", { min: 1, max: 40 });

  const line1 = requireString(v, input.line1, "line1", { min: 3, max: 160 });
  const line2 = optionalString(v, input.line2, "line2", 160);
  const area = requireString(v, input.area, "area", { min: 2, max: 80 });
  const city =
    input.city === undefined || input.city === null
      ? "Dhaka"
      : requireString(v, input.city, "city", { min: 2, max: 80 });
  const deliveryNotes = optionalString(v, input.deliveryNotes, "deliveryNotes", 300);

  return finish(v, { label, line1, line2, area, city, deliveryNotes });
}
