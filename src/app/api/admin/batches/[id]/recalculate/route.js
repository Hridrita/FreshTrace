import { NextResponse } from "next/server";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { getAdminSession } from "@/lib/admin/auth";
import { recalculateBatchFreshness } from "@/lib/services/admin-qc";

/**
 * `POST /api/admin/batches/:id/recalculate` — re-run the pricing engine.
 *
 * Used after a harvest date is corrected at the hub. The batch's tier and
 * price multiplier are recomputed from the harvest date and its most recent
 * QC timestamp, using the same decay engine the customer catalogue prices
 * with.
 */
export async function POST(request, { params }) {
  try {
    const session = await getAdminSession();

    if (!session) {
      return errorResponse(
        ERROR_CODES.UNAUTHENTICATED,
        "You must be signed in to the operations panel to do that.",
      );
    }

    const { id } = await params;

    const result = await recalculateBatchFreshness(id);

    return NextResponse.json({
      data: { batch: result.batch, adjustment: result.adjustment },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
