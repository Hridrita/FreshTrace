import { NextResponse } from "next/server";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { getAdminSession } from "@/lib/admin/auth";
import { logQcInspection } from "@/lib/services/admin-qc";

/**
 * `POST /api/admin/qc` — log a QC inspection.
 *
 * Body:
 * ```json
 * {
 *   "batchId": "…",
 *   "grade": "A" | "B" | "C",
 *   "weightKg": 12.5,
 *   "temperatureC": 8,
 *   "notes": "…",
 *   "photos": ["…"]
 * }
 * ```
 *
 * The inspection is recorded and the batch's freshness tier and price
 * multiplier are recomputed from the harvest date and the inspection
 * timestamp. A grade `C` fails the inspection regardless of the `passed`
 * flag — the grade is the evidence.
 */
export async function POST(request) {
  try {
    const session = await getAdminSession();

    if (!session) {
      return errorResponse(
        ERROR_CODES.UNAUTHENTICATED,
        "You must be signed in to the operations panel to do that.",
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(ERROR_CODES.VALIDATION_FAILED, "Request body must be valid JSON.");
    }

    const photos = Array.isArray(body?.photos)
      ? body.photos.filter((photo) => typeof photo === "string" && photo.trim() !== "")
      : [];

    const result = await logQcInspection(session.operatorId, {
      batchId: typeof body?.batchId === "string" ? body.batchId : "",
      grade: typeof body?.grade === "string" ? body.grade : "",
      weightKg: Number(body?.weightKg),
      temperatureC:
        body?.temperatureC === undefined || body?.temperatureC === null || body?.temperatureC === ""
          ? undefined
          : Number(body.temperatureC),
      notes: typeof body?.notes === "string" ? body.notes : undefined,
      photos,
      passed: body?.passed === undefined ? undefined : Boolean(body.passed),
    });

    return NextResponse.json({
      data: {
        batch: result.batch,
        log: result.log,
        adjustment: result.adjustment,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
