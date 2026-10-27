import { NextResponse } from "next/server";
import { listResponse } from "@/lib/api-response";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import { createSubscription, listSubscriptions } from "@/lib/services/subscriptions";
import {
  validateCreateSubscriptionInput,
  validateSubscriptionStatusFilter,
} from "@/lib/validation/subscription";

/**
 * `GET /api/subscriptions/me` — the signed-in customer's subscriptions.
 *
 * Auth: customer. A customer only ever sees their own subscriptions.
 * The `status` filter narrows the list to one lifecycle state.
 */
export async function GET(request) {
  try {
    const { user } = await requireSession();
    const { searchParams } = new URL(request.url);

    const result = validateSubscriptionStatusFilter(searchParams.get("status"));
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        `Unknown subscription status. Must be one of: active, paused, ended.`,
        { issues: result.errors },
      );
    }

    const subscriptions = await listSubscriptions(user.id, {
      status: result.data.status,
    });
    return listResponse(subscriptions);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `POST /api/subscriptions` — subscribe to a plan.
 *
 * Body: `{ planId, addressId, dayOfWeek }`.
 *
 * The plan must be active and the address must belong to the signed-in
 * customer. The subscription starts `active`, with its next delivery date
 * set to the next occurrence of the chosen weekday.
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

    const result = validateCreateSubscriptionInput(body);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "The subscription could not be created because some fields are invalid.",
        { issues: result.errors },
      );
    }

    const subscription = await createSubscription(user.id, result.data);
    return NextResponse.json({ data: subscription }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
