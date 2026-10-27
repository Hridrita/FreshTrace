import { dataResponse } from "@/lib/api-response";
import { handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import { getOrder } from "@/lib/services/orders";

/**
 * `GET /api/orders/:id` — one of the signed-in customer's orders.
 *
 * Auth: customer (own orders only). Another customer's order is reported as
 * `not_found` so the response never discloses that it exists.
 */
export async function GET(_request, ctx) {
  try {
    const { user } = await requireSession();
    const { id } = await ctx.params;

    const order = await getOrder(user.id, id);
    return dataResponse(order);
  } catch (err) {
    return handleRouteError(err);
  }
}
