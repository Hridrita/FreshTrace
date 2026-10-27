"use client";

import { useState, useTransition } from "react";
import { PauseCircle, PlayCircle, XCircle } from "lucide-react";
import {
  cancelSubscriptionAction,
  pauseSubscriptionAction,
  resumeSubscriptionAction,
} from "@/app/(customer)/app/subscriptions/actions";

/**
 * SubscriptionControls — pause, resume and cancel a subscription.
 *
 * The three actions are Server Actions, so each click writes to the database
 * in one round trip and the page re-renders with the new state. The
 * component is only responsible for the interaction: it disables the
 * buttons while a write is in flight, asks for confirmation before an
 * irreversible cancel, and shows the outcome.
 *
 * Cancelling is irreversible, so it is confirmed first. Pausing is
 * reversible, so it is not.
 *
 * @param {object} props
 * @param {string} props.subscriptionId
 * @param {"active" | "paused" | "ended"} props.status
 */
export default function SubscriptionControls({ subscriptionId, status }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState(null);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [pauseUntil, setPauseUntil] = useState(defaultPauseDate());

  /**
   * Run a Server Action and report the outcome.
   *
   * @param {() => Promise<{ ok: boolean, message: string }>} action
   */
  function run(action) {
    setMessage(null);

    startTransition(async () => {
      const result = await action();
      setMessage({ ok: result.ok, text: result.message });

      // A successful cancel ends the subscription, so there is nothing left
      // to confirm.
      if (result.ok && status === "active" && action === cancelAction) {
        setIsConfirmingCancel(false);
      }
    });
  }

  /**
   * Pause until the chosen date.
   */
  function cancelAction() {
    return cancelSubscriptionAction(subscriptionId);
  }

  if (status === "ended") {
    return (
      <p className="text-sm text-sand-500">
        This subscription has ended. Choose a plan below to start a new one.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {status === "active" ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-sand-600">
              Pause until
            </span>
            <input
              type="date"
              value={pauseUntil}
              min={todayString()}
              onChange={(event) => setPauseUntil(event.target.value)}
              className="mt-1 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
            />
          </label>

          <button
            type="button"
            onClick={() => run(() => pauseSubscriptionAction(subscriptionId, pauseUntil))}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sand-200 bg-white px-3.5 py-2 text-sm font-semibold text-sand-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PauseCircle className="size-4" aria-hidden="true" />
            {isPending ? "Working…" : "Pause subscription"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => run(() => resumeSubscriptionAction(subscriptionId))}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <PlayCircle className="size-4" aria-hidden="true" />
          {isPending ? "Working…" : "Resume subscription"}
        </button>
      )}

      {/* ── Cancel ──────────────────────────────────────────────────
          Cancelling is irreversible, so it is confirmed first. */}
      <div>
        {isConfirmingCancel ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-expired-500/30 bg-expired-50 px-3 py-2.5">
            <p className="text-sm text-expired-800">
              Cancel this subscription for good? No further deliveries will be
              made.
            </p>

            <button
              type="button"
              onClick={() => run(cancelAction)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-expired-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-expired-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle className="size-4" aria-hidden="true" />
              {isPending ? "Working…" : "Yes, cancel it"}
            </button>

            <button
              type="button"
              onClick={() => setIsConfirmingCancel(false)}
              disabled={isPending}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-sand-600 transition hover:bg-sand-100 disabled:opacity-60"
            >
              Keep it
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsConfirmingCancel(true)}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-expired-700 transition hover:text-expired-800 disabled:opacity-60"
          >
            <XCircle className="size-4" aria-hidden="true" />
            Cancel subscription
          </button>
        )}
      </div>

      {message ? (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.ok
              ? "border-fresh-600/30 bg-fresh-50 text-fresh-800"
              : "border-expired-500/30 bg-expired-50 text-expired-800"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Today in the app timezone, as `YYYY-MM-DD`.
 *
 * @returns {string}
 */
function todayString() {
  const now = new Date();
  const shifted = new Date(now.getTime() + 6 * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * A sensible default pause date: two weeks from today.
 *
 * @returns {string}
 */
function defaultPauseDate() {
  const shifted = new Date(Date.now() + 6 * 3_600_000);
  shifted.setUTCDate(shifted.getUTCDate() + 14);
  return shifted.toISOString().slice(0, 10);
}
