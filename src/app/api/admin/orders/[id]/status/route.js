import { NextResponse } from "next/server";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { getAdminSession } from "@/lib/admin/auth";
import { updateOrderStatus } from "@/lib/services/admin-orders";

/**
 * `PATCH /api/admin/orders/:id/status` — move an order through fulfilment.
 *
 * Body: `{ status, reason? }`.
 *
 * The transition is validated against the order's current status — a
 * delivered order cannot be reopened, and a cancelled one cannot be
 * resurrected.
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

    const status = typeof body?.status === "string" ? body.status : "";

    const order = await updateOrderStatus(id, status, {
      reason: typeof body?.reason === "string" ? body.reason : undefined,
    });

    return NextResponse.json({ data: order });
  } catch (err) {
    return handleRouteError(err);
  }
}
