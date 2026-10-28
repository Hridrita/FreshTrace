"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, X } from "lucide-react";

/**
 * Refund decision control.
 *
 * A refund request is reconciled against its order on the server before it
 * is written — the amount cannot exceed the order total, the lines must
 * belong to that order, and the lines must add up to the total. This
 * component only offers the three decisions and surfaces the server's
 * verdict if it refuses.
 */
export default function RefundDecisionControl({ refundId, orderCode, amount }) {
  const router = useRouter();

  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");

  async function decide(decision) {
    setError("");
    setPending(decision);

    try {
      const response = await fetch(`/api/admin/refunds/${refundId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? "The decision could not be saved.");
        setPending(null);
        return;
      }

      setPending(null);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setPending(null);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => decide("approved")}
          disabled={pending !== null}
          title={`Approve a ${amount} refund on ${orderCode}`}
          className="inline-flex items-center gap-1 rounded-full bg-fresh-50 px-2.5 py-1 text-xs font-medium text-fresh-800 ring-1 ring-inset ring-fresh-600/20 transition hover:bg-fresh-100 disabled:opacity-50"
        >
          {pending === "approved" ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-3" aria-hidden="true" />
          )}
          Approve
        </button>

        <button
          type="button"
          onClick={() => decide("processed")}
          disabled={pending !== null}
          title={`Process a ${amount} refund on ${orderCode}`}
          className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-500/40 transition hover:bg-brand-200 disabled:opacity-50"
        >
          {pending === "processed" ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="size-3" aria-hidden="true" />
          )}
          Process
        </button>

        <button
          type="button"
          onClick={() => decide("rejected")}
          disabled={pending !== null}
          title={`Reject the refund on ${orderCode}`}
          className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2.5 py-1 text-xs font-medium text-sand-600 ring-1 ring-inset ring-sand-300/60 transition hover:bg-sand-200 disabled:opacity-50"
        >
          {pending === "rejected" ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <X className="size-3" aria-hidden="true" />
          )}
          Reject
        </button>
      </span>

      {error ? (
        <span role="alert" className="text-[11px] text-expired-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
