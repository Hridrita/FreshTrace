"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guard";
import {
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
} from "@/lib/services/subscriptions";
import { validatePauseSubscriptionInput } from "@/lib/validation/subscription";

/**
 * Subscription server actions.
 *
 * The page's pause, resume and cancel controls are Server Actions, so a
 * click posts straight to the server, the database is updated in one write,
 * and the page re-renders with the new state — no client-side cache to keep
 * in sync and no intermediate fetch to fail.
 *
 * Each action returns a small result object rather than throwing, so the
 * client component can show a message without an error boundary.
 */

/**
 * @typedef {{ ok: boolean, message: string }} ActionResult
 */

/**
 * Pause a subscription until a date.
 *
 * @param {string} subscriptionId
 * @param {string} until `YYYY-MM-DD`
 * @returns {Promise<ActionResult>}
 */
export async function pauseSubscriptionAction(subscriptionId, until) {
  const { user } = await requireSession();

  const parsed = validatePauseSubscriptionInput({ until });
  if (!parsed.success) {
    return { ok: false, message: "Choose a date after today to pause until." };
  }

  try {
    const subscription = await pauseSubscription(
      user.id,
      subscriptionId,
      parsed.data.until,
    );

    revalidatePath("/app/subscriptions");
    revalidatePath("/app");

    return {
      ok: true,
      message: `Paused until ${parsed.data.until.toISOString().slice(0, 10)}. No deliveries will be made while paused.`,
      status: subscription.status,
    };
  } catch (err) {
    return { ok: false, message: messageFor(err, "The subscription could not be paused.") };
  }
}

/**
 * Resume a paused subscription.
 *
 * @param {string} subscriptionId
 * @returns {Promise<ActionResult>}
 */
export async function resumeSubscriptionAction(subscriptionId) {
  const { user } = await requireSession();

  try {
    const subscription = await resumeSubscription(user.id, subscriptionId);

    revalidatePath("/app/subscriptions");
    revalidatePath("/app");

    return {
      ok: true,
      message: "Resumed. Your next delivery is scheduled again.",
      status: subscription.status,
    };
  } catch (err) {
    return { ok: false, message: messageFor(err, "The subscription could not be resumed.") };
  }
}

/**
 * Cancel a subscription.
 *
 * @param {string} subscriptionId
 * @returns {Promise<ActionResult>}
 */
export async function cancelSubscriptionAction(subscriptionId) {
  const { user } = await requireSession();

  try {
    const subscription = await cancelSubscription(user.id, subscriptionId);

    revalidatePath("/app/subscriptions");
    revalidatePath("/app");

    return {
      ok: true,
      message: "Your subscription has been cancelled. No further deliveries will be made.",
      status: subscription.status,
    };
  } catch (err) {
    return { ok: false, message: messageFor(err, "The subscription could not be cancelled.") };
  }
}

/**
 * The customer-facing message for a thrown error.
 *
 * An `ApiError` carries a message that is already written for the customer
 * ("This subscription has already ended."), so it is used as-is. Anything
 * else is an unexpected failure and gets a neutral fallback.
 *
 * @param {unknown} err
 * @param {string} fallback
 * @returns {string}
 */
function messageFor(err, fallback) {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err).code === "string" &&
    "message" in err &&
    typeof (err).message === "string"
  ) {
    return (err).message;
  }

  return fallback;
}
