import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCart, getCartItemCount } from "@/lib/services/cart";

/**
 * Cart reads for the UI.
 *
 * SRS §9.3: Server Components read directly through the Prisma client
 * singleton — there is no internal HTTP call. This module wraps the queries
 * the cart and checkout pages need and is memoised per request with
 * `React.cache`, so a page that reads the same cart twice performs one
 * query.
 *
 * The API routes under `src/app/api/cart/` expose the same data to clients;
 * both paths share the service layer in `src/lib/services/`, so the UI and
 * the API can never disagree about pricing.
 */

/**
 * The signed-in customer's cart, with every line priced.
 *
 * Returns `null` when there is no signed-in user — the cart page redirects
 * to the login screen in that case.
 *
 * @param {string | null | undefined} userId
 * @returns {Promise<import("@/lib/services/cart").CartView | null>}
 */
export const getCartForUser = cache(async (userId) => {
  if (!userId) return null;
  return getCart(userId);
});

/**
 * The signed-in customer's delivery addresses, default first.
 *
 * @param {string | null | undefined} userId
 * @returns {Promise<import("@prisma/client").Address[]>}
 */
export const getAddressesForUser = cache(async (userId) => {
  if (!userId) return [];

  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
});

/**
 * The number of lines in the signed-in customer's cart.
 *
 * Read-only: rendering the customer shell must not write a cart row.
 *
 * @param {string | null | undefined} userId
 * @returns {Promise<number>}
 */
export const getCartCount = cache(async (userId) => {
  return getCartItemCount(userId);
});
