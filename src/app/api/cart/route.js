import { dataResponse } from "@/lib/api-response";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import { addToCart, getCart } from "@/lib/services/cart";
import { validateAddToCartInput } from "@/lib/validation/cart";

/**
 * `GET /api/cart` — the signed-in customer's cart.
 *
 * Auth: customer. Every cart line is priced at read time from the batch's
 * current freshness tier, so the total always reflects today's price.
 */
export async function GET() {
  try {
    const { user } = await requireSession();
    const cart = await getCart(user.id);
    return dataResponse(cart);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `POST /api/cart` — add a batch to the cart.
 *
 * Body: `{ batchId, qty }`.
 *
 * Adding a batch that is already in the cart increases the quantity of the
 * existing line rather than creating a second one.
 */
export async function POST(request) {
  try {
    const { user } = await requireSession();

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(ERROR_CODES.VALIDATION_FAILED, "Request body must be valid JSON.");
    }

    const result = validateAddToCartInput(body);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "The item could not be added to your cart because some fields are invalid.",
        { issues: result.errors },
      );
    }

    const { batchId, qty } = result.data;
    const cart = await addToCart(user.id, batchId, qty);

    return dataResponse(cart);
  } catch (err) {
    return handleRouteError(err);
  }
}
