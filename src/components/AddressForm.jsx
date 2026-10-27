"use client";

/**
 * AddressForm — an editable delivery-address form.
 *
 * Used in two places:
 *
 * 1. **Add** — the account page's "Add another address" panel, with no
 *    `initialValues`.
 * 2. **Edit** — the account page's edit panel, with the saved address's
 *    values as `initialValues`.
 *
 * The component is deliberately uncontrolled: the customer types into plain
 * inputs and the values are handed to `onSubmit` on submit. That keeps the
 * form cheap to mount many times on a page that lists several addresses,
 * and it means the form never fights the customer's typing.
 *
 * The field set and the copy match `AddressQuickForm`, which the checkout
 * uses — a courier needs the street line, the area, the city and optionally
 * a flat reference and a note, and nothing more.
 *
 * @param {object} props
 * @param {(values: { label: string, line1: string, line2: string, area: string, city: string, deliveryNotes: string }) => void} props.onSubmit
 *   called with the entered values
 * @param {{ label?: string | null, line1?: string | null, line2?: string | null, area?: string | null, city?: string | null, deliveryNotes?: string | null }} [props.initialValues]
 *   the values to prefill — omit for a blank form
 * @param {boolean} [props.isPending] a save is in flight
 * @param {string | null} [props.error] the last failure message
 * @param {string} [props.submitLabel] the submit button's text
 * @param {string} [props.cancelLabel] the cancel button's text
 * @param {() => void} [props.onCancel] called when the customer backs out
 */
export default function AddressForm({
  onSubmit,
  initialValues,
  isPending = false,
  error = null,
  submitLabel = "Save address",
  cancelLabel = "Cancel",
  onCancel,
}) {
  const values = initialValues ?? {};

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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Address label"
          name="label"
          placeholder="Home"
          maxLength={40}
          defaultValue={values.label ?? "Home"}
        />
        <Field
          label="City"
          name="city"
          placeholder="Dhaka"
          maxLength={80}
          defaultValue={values.city ?? "Dhaka"}
        />
      </div>

      <Field
        label="House and street"
        name="line1"
        placeholder="House 10, Road 5"
        maxLength={160}
        defaultValue={values.line1 ?? ""}
        required
      />

      <Field
        label="Flat or landmark (optional)"
        name="line2"
        placeholder="Flat 4B, beside the mosque"
        maxLength={160}
        defaultValue={values.line2 ?? ""}
      />

      <Field
        label="Area"
        name="area"
        placeholder="Gulshan-2"
        maxLength={80}
        defaultValue={values.area ?? ""}
        required
      />

      <Field
        label="Delivery notes (optional)"
        name="deliveryNotes"
        placeholder="Call when you arrive"
        maxLength={300}
        defaultValue={values.deliveryNotes ?? ""}
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-expired-500/30 bg-expired-50 px-3 py-2 text-sm text-expired-800"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg px-2.5 py-2 text-sm font-medium text-sand-600 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        ) : null}
      </div>
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
