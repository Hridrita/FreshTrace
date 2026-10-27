import { PAYMENT_METHODS } from "@/lib/constants";
import {
  Validator,
  finish,
  requireEnum,
  requireNumber,
  requireString,
} from "@/lib/validation/schema";

/**
 * Cart and order input validation.
 *
 * The house pattern (SRS §2.4) is a `Validator` that accumulates issues, the
 * primitives that mutate it, and `finish` that turns the run into a
 * `{ success, data }` / `{ success, errors }` result.
 *
 * Quantities are weights, so they are floats — a customer can order 1.5 kg
 * of tomatoes. The upper bound exists so a typo cannot ask for 10,000 kg and
 * fail later at the stock check with a confusing message.
 */

/**
 * @typedef {object} AddToCartInput
 * @property {string} batchId
 * @property {number} qty
 */

/**
 * @typedef {object} UpdateCartItemInput
 * @property {number} qty
 */

/**
 * @typedef {object} OrderItemInput
 * @property {string} batchId
 * @property {number} qty
 */

/**
 * @typedef {object} PlaceOrderInput
 * @property {OrderItemInput[]} items
 * @property {string} addressId
 * @property {string} [paymentMethod]
 */

/** The largest quantity a single line may request, in the unit of sale. */
export const MAX_LINE_QTY = 500;

/** The largest number of lines a single order may contain. */
export const MAX_ORDER_LINES = 50;

/**
 * Validate an "add to cart" payload.
 *
 * @param {unknown} body
 * @returns {import("@/lib/validation/schema").ValidationResult<AddToCartInput>}
 */
export function validateAddToCartInput(body) {
  const v = new Validator();
  const input = /** @type {Record<string, unknown>} */ (body ?? {});

  const batchId = requireString(v, input.batchId, "batchId", { min: 1, max: 64 });
  const qty = requireNumber(v, input.qty, "qty", { min: 0.1, max: MAX_LINE_QTY });

  return finish(v, { batchId, qty });
}

/**
 * Validate a "set the quantity" payload.
 *
 * A quantity of zero is allowed and means "remove this line" — the service
 * handles it as a removal, so the client does not need a second call.
 *
 * @param {unknown} body
 * @returns {import("@/lib/validation/schema").ValidationResult<UpdateCartItemInput>}
 */
export function validateUpdateCartItemInput(body) {
  const v = new Validator();
  const input = /** @type {Record<string, unknown>} */ (body ?? {});

  const qty = requireNumber(v, input.qty, "qty", { min: 0, max: MAX_LINE_QTY });

  return finish(v, { qty });
}

/**
 * Validate a "place order" payload.
 *
 * @param {unknown} body
 * @returns {import("@/lib/validation/schema").ValidationResult<PlaceOrderInput>}
 */
export function validatePlaceOrderInput(body) {
  const v = new Validator();
  const input = /** @type {Record<string, unknown>} */ (body ?? {});

  const addressId = requireString(v, input.addressId, "addressId", { min: 1, max: 64 });

  /** @type {OrderItemInput[]} */
  const items = [];

  if (!Array.isArray(input.items) || input.items.length === 0) {
    v.add("items", "An order must contain at least one item.");
  } else {
    if (input.items.length > MAX_ORDER_LINES) {
      v.add("items", `An order may contain at most ${MAX_ORDER_LINES} lines.`);
    }

    const seen = new Set();

    input.items.forEach((raw, index) => {
      const entry = /** @type {Record<string, unknown>} */ (raw ?? {});
      const path = `items[${index}]`;

      const batchId = requireString(v, entry.batchId, `${path}.batchId`, {
        min: 1,
        max: 64,
      });
      const qty = requireNumber(v, entry.qty, `${path}.qty`, {
        min: 0.1,
        max: MAX_LINE_QTY,
      });

      if (batchId !== undefined) {
        if (seen.has(batchId)) {
          v.add(`${path}.batchId`, "The same batch cannot appear twice in an order.");
        }
        seen.add(batchId);
      }

      if (batchId !== undefined && qty !== undefined) {
        items.push({ batchId, qty });
      }
    });
  }

  // The payment method is optional in v1 — the mock checkout picks it up
  // later. It is validated against the allowlist here so a bad value is
  // rejected at the door rather than at the payment step.
  let paymentMethod;
  if (input.paymentMethod !== undefined && input.paymentMethod !== null) {
    paymentMethod = requireEnum(v, input.paymentMethod, "paymentMethod", PAYMENT_METHODS);
  }

  return finish(v, { items, addressId, paymentMethod });
}
