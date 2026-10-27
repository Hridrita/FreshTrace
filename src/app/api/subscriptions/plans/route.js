import { listResponse } from "@/lib/api-response";
import { handleRouteError } from "@/lib/errors";
import { listActivePlans } from "@/lib/services/subscriptions";

/**
 * `GET /api/subscriptions/plans` — the subscription plans on offer.
 *
 * Auth: any. The plan catalogue is browsable without an account; only the
 * subscription itself needs a signed-in customer.
 *
 * Only active plans are returned. A plan an admin deactivates disappears
 * from this list, while subscriptions already on it keep running.
 */
export async function GET() {
  try {
    const plans = await listActivePlans();
    return listResponse(plans);
  } catch (err) {
    return handleRouteError(err);
  }
}
