import { dataResponse } from "@/lib/api-response";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import { pauseSubscription } from "@/lib/services/subscriptions";
import { validatePauseSubscriptionInput } from "@/lib/validation/subscription";

/**
 * `POST /api/subscriptions/:id/pause` — pause a subscription.
 *
 * Body: `{ until }` — the date the pause ends.
 *
 * A paused subscription generates no renewal orders. The subscription must
 * be the signed-in customer's own and must currently be active.
 */
export async function POST(request, { params }) {
  try {
    const { user } = await requireSession();
    const { id } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(ERROR_CODES.VALIDATION_FAILED, "Request body must be valid JSON.");
    }

    const result = validatePauseSubscriptionInput(body);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "The subscription could not be paused because some fields are invalid.",
        { issues: result.errors },
      );
    }

    const subscription = await pauseSubscription(user.id, id, result.data.until);
    return dataResponse(subscription);
  } catch (err) {
    return handleRouteError(err);
  }
}
