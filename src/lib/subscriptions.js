import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Subscription reads for the UI.
 *
 * SRS §9.3: Server Components read directly through the Prisma client
 * singleton — there is no internal HTTP call. This module wraps the queries
 * the layout and the subscriptions page need, memoised per request with
 * `React.cache`, so a page that reads the same thing twice performs one
 * query.
 *
 * The API routes under `src/app/api/subscriptions/` expose the same data to
 * clients; both paths share the service layer in `src/lib/services/`, so the
 * UI and the API can never disagree about a subscription's state.
 */

/**
 * Whether the customer has a live subscription.
 *
 * Only an `active` plan counts: a paused plan is not delivering anything, so
 * marking the navigation link as if it were would misreport the state.
 *
 * Read-only: rendering the customer shell must not write a row.
 *
 * @param {string | null | undefined} userId
 * @returns {Promise<boolean>}
 */
export const hasActiveSubscription = cache(async (userId) => {
  if (!userId) return false;

  const count = await prisma.subscription.count({
    where: { customerId: userId, status: "active" },
  });

  return count > 0;
});
