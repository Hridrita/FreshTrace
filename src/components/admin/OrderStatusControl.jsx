"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Order fulfilment control.
 *
 * A select of the statuses the order is allowed to move to, derived from
 * the order's current status. The permitted transitions are enforced on the
 * server too — this control just keeps the operator from being offered a
 * move that would be rejected.
 */
export default function OrderStatusControl({ orderId, currentStatus, allowedStatuses }) {
  const router = useRouter();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (!allowedStatuses || allowedStatuses.length === 0) {
    return (
      <span className="text-xs text-sand-400">
        {currentStatus === "delivered" ? "Complete" : "No further moves"}
      </span>
    );
  }

  async function handleChange(event) {
    const nextStatus = event.target.value;

    if (!nextStatus) return;

    setError("");
    setPending(true);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          reason:
            nextStatus === "cancelled" ? "Cancelled by operations" : undefined,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? "The status could not be changed.");
        setPending(false);
        return;
      }

      setPending(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1.5">
        {pending ? (
          <Loader2 className="size-3.5 animate-spin text-sand-400" aria-hidden="true" />
        ) : null}
        <select
          value=""
          onChange={handleChange}
          disabled={pending}
          aria-label="Change order status"
          className="rounded-full border border-sand-200 bg-white/80 px-2.5 py-1 text-xs text-sand-600 outline-none transition hover:bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-200/60 disabled:opacity-60"
        >
          <option value="">Move to…</option>
          {allowedStatuses.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </span>

      {error ? (
        <span role="alert" className="text-[11px] text-expired-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
