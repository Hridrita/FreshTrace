import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/errors";
import {
  ADMIN_SESSION_COOKIE_NAME,
  adminCookieOptions,
  destroyAdminSession,
} from "@/lib/admin/auth";

/**
 * `DELETE /api/admin/login` — sign out of the operations panel.
 *
 * Sign-*in* lives on the unified route, `POST /api/auth/login`: there is one
 * sign-in page for the whole application, and it decides whether to open a
 * customer session or the dedicated operations session. This endpoint only
 * remains because the panel's sign-out is a different operation from the
 * customer logout — the admin cookie and the customer cookie are independent.
 *
 * The admin cookie is cleared here as well as the session row being deleted,
 * so a stale cookie cannot be replayed.
 */
export async function DELETE() {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

    await destroyAdminSession(token);

    const response = NextResponse.json({ data: { signedOut: true } });

    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", adminCookieOptions(0));
    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}
