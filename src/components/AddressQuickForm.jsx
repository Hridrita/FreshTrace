"use client";

import { MapPin, Plus } from "lucide-react";

/**
 * AddressQuickForm — an inline delivery-address form for checkout.
 *
 * A customer who has never saved an address should not be blocked from
 * ordering. This form is shown in place of the saved-address list when the
 * customer has none: they type where the produce should go, the address is
 * saved, and the checkout continues with it selected.
 *
 * The form is deliberately short — street line, area, city and an optional
 * flat/reference — because a courier needs those and nothing more. The
 * fields the app cannot do without are marked as required; the optional ones
 * are not, so a customer typing on a phone is not blocked by a missing
 * flat number.
 *
 * @param {object} props
 * @param {(values: { label: string, line1: string, line2: string, area: string, city: string, deliveryNotes: string }) => void} props.onSubmit
 *   called with the entered values
 * @param {boolean} [props.isPending] a save is in flight
 * @param {string | null} [props.error] the last failure message
 */
export default function AddressQuickForm({ onSubmit, isPending = false, error = null }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);

        onSubmit({
          label: String(data.get("label") ?? "").trim() || "Home",
          line1: String(data.get("line1") ?? "").trim(),
          line2: String(data.get("line2") ?? "").trim(),
          area: String(data.get("area") ?? "").trim(),
          city: String(data.get("city") ?? "").trim() || "Dhaka",
          deliveryNotes: String(data.get("deliveryNotes") ?? "").trim(),
        });
      }}
      className="space-y-3"
    >
      <div className="flex items-start gap-2.5 rounded-lg border border-brand-500/20 bg-brand-50/70 px-3 py-2.5">
        <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-sand-700">
          You don&apos;t have a saved address yet. Add one below and we&apos;ll
          remember it for next time.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Address label" name="label" placeholder="Home" maxLength={40} />
        <Field label="City" name="city" placeholder="Dhaka" maxLength={80} defaultValue="Dhaka" />
      </div>

      <Field
        label="House and street"
        name="line1"
        placeholder="House 10, Road 5"
        maxLength={160}
        required
      />

      <Field
        label="Flat or landmark (optional)"
        name="line2"
        placeholder="Flat 4B, beside the mosque"
        maxLength={160}
      />

      <Field
        label="Area"
        name="area"
        placeholder="Gulshan-2"
        maxLength={80}
        required
      />

      <Field
        label="Delivery notes (optional)"
        name="deliveryNotes"
        placeholder="Call when you arrive"
        maxLength={300}
      />

      {error ? (
        <p role="alert" className="rounded-lg border border-expired-500/30 bg-expired-50 px-3 py-2 text-sm text-expired-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-sand-200 bg-white px-3.5 py-2 text-sm font-semibold text-sand-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="size-4" aria-hidden="true" />
        {isPending ? "Saving…" : "Save and use this address"}
      </button>
    </form>
  );
}

/**
 * A labelled input.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.name
 * @param {string} [props.placeholder]
 * @param {number} [props.maxLength]
 * @param {boolean} [props.required]
 * @param {string} [props.defaultValue]
 */
function Field({
  label,
  name,
  placeholder,
  maxLength,
  required = false,
  defaultValue,
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-sand-600">
        {label}
        {required ? (
          <span className="ml-0.5 text-expired-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </span>

      <input
        type="text"
        name={name}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
      />
    </label>
  );
}
