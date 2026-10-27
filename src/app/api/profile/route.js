import { dataResponse } from "@/lib/api-response";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import { getProfile, updateProfile } from "@/lib/services/profile";
import { validateProfileInput } from "@/lib/validation/profile";

/**
 * `GET /api/profile` — the signed-in customer's profile.
 *
 * Auth: customer. Only the profile's own fields are returned — never the
 * password hash or the reset token.
 */
export async function GET() {
  try {
    const { user } = await requireSession();

    const profile = await getProfile(user.id);
    return dataResponse(profile);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `PATCH /api/profile` — update the customer's display name.
 *
 * Body: `{ name }`. The email is the account's identity and is not
 * editable, so it is ignored if it is sent.
 *
 * Auth: customer (own profile only).
 */
export async function PATCH(request) {
  try {
    const { user } = await requireSession();

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "Request body must be valid JSON.",
      );
    }

    const result = validateProfileInput(body);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "Your profile could not be saved because some fields are invalid.",
        { issues: result.errors },
      );
    }

    const profile = await updateProfile(user.id, result.data);
    return dataResponse(profile);
  } catch (err) {
    return handleRouteError(err);
  }
}
