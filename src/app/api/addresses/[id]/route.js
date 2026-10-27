import { dataResponse } from "@/lib/api-response";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import {
  deleteAddress,
  getAddress,
  setDefaultAddress,
  updateAddress,
} from "@/lib/services/addresses";
import { validateAddressInput } from "@/lib/validation/address";

/**
 * `GET /api/addresses/:id` — one of the signed-in customer's addresses.
 *
 * Auth: customer (own addresses only). Another customer's address is
 * reported as `not_found` so the response never discloses that it exists.
 */
export async function GET(_request, { params }) {
  try {
    const { user } = await requireSession();
    const { id } = await params;

    const address = await getAddress(user.id, id);
    return dataResponse(address);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `PATCH /api/addresses/:id` — update one of the customer's addresses.
 *
 * Body: `{ label?, line1, line2?, area, city?, deliveryNotes? }` — the same
 * shape `POST /api/addresses` takes, so the account page's edit form and the
 * checkout quick-form share one validator.
 *
 * Auth: customer (own addresses only).
 */
export async function PATCH(request, { params }) {
  try {
    const { user } = await requireSession();
    const { id } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "Request body must be valid JSON.",
      );
    }

    const result = validateAddressInput(body);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "The address could not be saved because some fields are invalid.",
        { issues: result.errors },
      );
    }

    const address = await updateAddress(user.id, id, result.data);
    return dataResponse(address);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `DELETE /api/addresses/:id` — delete one of the customer's addresses.
 *
 * An address used by an active or paused subscription is protected: the
 * delete is rejected with a conflict naming the subscriptions, because the
 * delivery has nowhere to go otherwise (openspec `subscription-management`).
 *
 * Auth: customer (own addresses only).
 */
export async function DELETE(_request, { params }) {
  try {
    const { user } = await requireSession();
    const { id } = await params;

    const result = await deleteAddress(user.id, id);
    return dataResponse(result);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `POST /api/addresses/:id` — make an address the default.
 *
 * Exposed as a POST on the address rather than a PATCH because the default
 * is a state change, not a field edit.
 */
export async function POST(request, { params }) {
  try {
    const { user } = await requireSession();
    const { id } = await params;

    const address = await setDefaultAddress(user.id, id);
    return dataResponse(address);
  } catch (err) {
    return handleRouteError(err);
  }
}
