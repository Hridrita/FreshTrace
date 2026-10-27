import { NextResponse } from "next/server";
import { dataResponse, listResponse } from "@/lib/api-response";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import { createAddress, listAddresses } from "@/lib/services/addresses";
import { validateAddressInput } from "@/lib/validation/address";

/**
 * `GET /api/addresses` — the signed-in customer's saved addresses.
 *
 * Auth: customer. A customer only ever sees their own addresses.
 */
export async function GET() {
  try {
    const { user } = await requireSession();
    const addresses = await listAddresses(user.id);
    return listResponse(addresses);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `POST /api/addresses` — save a delivery address.
 *
 * Body: `{ label?, line1, line2?, area, city?, deliveryNotes? }`.
 *
 * This is the endpoint behind the checkout quick-form: a customer who has
 * never saved an address types one here, it is saved like any other
 * address, and the checkout continues with it selected.
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

    const result = validateAddressInput(body);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "The address could not be saved because some fields are invalid.",
        { issues: result.errors },
      );
    }

    const address = await createAddress(user.id, result.data);
    return NextResponse.json({ data: address }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
