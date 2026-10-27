import { dataResponse } from "@/lib/api-response";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import { removeFromCart, updateCartItem } from "@/lib/services/cart";
import { validateUpdateCartItemInput } from "@/lib/validation/cart";

/**
 * `PATCH /api/cart/items/:batchId` — set the quantity of a cart line.
 *
 * Body: `{ qty }`.
 *
 * A quantity of zero removes the line, so the client can empty a line
 * without a second request.
 */
export async function PATCH(request, ctx) {
  try {
    const { user } = await requireSession();
    const { batchId } = await ctx.params;

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(ERROR_CODES.VALIDATION_FAILED, "Request body must be valid JSON.");
    }

    const result = validateUpdateCartItemInput(body);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "The quantity could not be updated because it is invalid.",
        { issues: result.errors },
      );
    }

    const cart = await updateCartItem(user.id, batchId, result.data.qty);
    return dataResponse(cart);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `DELETE /api/cart/items/:batchId` — remove a line from the cart.
 */
export async function DELETE(_request, ctx) {
  try {
    const { user } = await requireSession();
    const { batchId } = await ctx.params;

    const cart = await removeFromCart(user.id, batchId);
    return dataResponse(cart);
  } catch (err) {
    return handleRouteError(err);
  }
}
