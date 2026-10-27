import { NextResponse } from "next/server";
import { dataResponse, listResponse } from "@/lib/api-response";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { requireSession } from "@/lib/auth/guard";
import { listOrders, placeOrder } from "@/lib/services/orders";
import { validatePlaceOrderInput } from "@/lib/validation/cart";
import { ORDER_STATUSES } from "@/lib/constants";

/**
 * `GET /api/orders` — the signed-in customer's orders, newest first.
 *
 * Auth: customer. A customer only ever sees their own orders. The
 * `status` filter narrows the list to one lifecycle state.
 */
export async function GET(request) {
  try {
    const { user } = await requireSession();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    if (status && !ORDER_STATUSES.includes(status)) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        `Unknown order status. Must be one of: ${ORDER_STATUSES.join(", ")}.`,
        { path: "status" },
      );
    }

    const orders = await listOrders(user.id, { status: status ?? undefined });
    return listResponse(orders);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `POST /api/orders` — place an order.
 *
 * Body: `{ items: [{ batchId, qty }], addressId, paymentMethod? }`.
 *
 * The order is created in `pending_payment`. Stock is reserved atomically:
 * if any line cannot be satisfied, no order is created and no stock is
 * reserved on any line.
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

    const result = validatePlaceOrderInput(body);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "The order could not be placed because some fields are invalid.",
        { issues: result.errors },
      );
    }

    const order = await placeOrder(user.id, result.data);
    return NextResponse.json({ data: order }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
