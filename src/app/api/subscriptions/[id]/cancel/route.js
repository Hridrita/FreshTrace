import { dataResponse } from "@/lib/api-response";
import { handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import { cancelSubscription } from "@/lib/services/subscriptions";

/**
 * `POST /api/subscriptions/:id/cancel` — end a subscription.
 *
 * The subscription status becomes `ended`, the end date is recorded, and no
 * further renewal orders are created for it.
 */
export async function POST(_request, { params }) {
  try {
    const { user } = await requireSession();
    const { id } = await params;

    const subscription = await cancelSubscription(user.id, id);
    return dataResponse(subscription);
  } catch (err) {
    return handleRouteError(err);
  }
}
