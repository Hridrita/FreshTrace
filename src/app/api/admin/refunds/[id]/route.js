import { NextResponse } from "next/server";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { getAdminSession } from "@/lib/admin/auth";
import { decideRefund } from "@/lib/services/admin-orders";

/**
 * `PATCH /api/admin/refunds/:id` — decide a refund request.
 *
 * Body: `{ decision: "approved" | "rejected" | "processed" }`.
 *
 * The refund is reconciled against its order before it is written: the
 * amount cannot exceed the order total, the lines must belong to that
 * order, and the lines must add up to the refund amount.
 */
export async function PATCH(request, { params }) {
  try {
    const session = await getAdminSession();

    if (!session) {
      return errorResponse(
        ERROR_CODES.UNAUTHENTICATED,
        "You must be signed in to the operations panel to do that.",
      );
    }

    const { id } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(ERROR_CODES.VALIDATION_FAILED, "Request body must be valid JSON.");
    }

    const decision = typeof body?.decision === "string" ? body.decision : "";

    const refund = await decideRefund(id, decision, session.operatorId);

    return NextResponse.json({ data: refund });
  } catch (err) {
    return handleRouteError(err);
  }
}
