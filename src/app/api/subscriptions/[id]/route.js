import { dataResponse } from "@/lib/api-response";
import { handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import { getSubscription } from "@/lib/services/subscriptions";

/**
 * `GET /api/subscriptions/:id` — one of the customer's subscriptions.
 *
 * Auth: customer (own). Another customer's subscription is reported as
 * `not_found`, so the response never discloses that it exists.
 */
export async function GET(_request, { params }) {
  try {
    const { user } = await requireSession();
    const { id } = await params;

    const subscription = await getSubscription(user.id, id);
    return dataResponse(subscription);
  } catch (err) {
    return handleRouteError(err);
  }
}
