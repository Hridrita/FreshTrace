import { dataResponse } from "@/lib/api-response";
import { handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import { resumeSubscription } from "@/lib/services/subscriptions";

/**
 * `POST /api/subscriptions/:id/resume` — resume a paused subscription.
 *
 * The subscription returns to `active`, the pause-until date is cleared, and
 * the next delivery date is recomputed to the next occurrence of the chosen
 * weekday, skipping any hub closure.
 */
export async function POST(_request, { params }) {
  try {
    const { user } = await requireSession();
    const { id } = await params;

    const subscription = await resumeSubscription(user.id, id);
    return dataResponse(subscription);
  } catch (err) {
    return handleRouteError(err);
  }
}
