"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import AddressForm from "@/components/AddressForm";

/**
 * AddressManager — the customer's saved delivery addresses.
 *
 * The account page lists every address the customer has saved and lets them
 * add, edit, delete and choose a default. Each action is a small write to
 * the API, and the page re-renders with the new list afterwards.
 *
 * Two rules from the spec shape the delete behaviour: an address used by an
 * **active or paused** subscription is protected — the API rejects the
 * delete with a conflict, and the message is shown here rather than
 * swallowed — and the customer is asked to confirm first, because a delete
 * is not something they can undo by retyping.
 *
 * @param {object} props
 * @param {Array<{ id: string, label: string, line1: string, line2: string | null, area: string, city: string, deliveryNotes: string | null, isDefault: boolean }>} props.addresses
 */
export default function AddressManager({ addresses }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /** Which address is being edited, or `"new"` for the add panel, or null. */
  const [editingId, setEditingId] = useState(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  /**
   * Run an API call and report the outcome.
   *
   * @param {() => Promise<Response>} request
   * @param {string} successMessage
   */
  function run(request, successMessage) {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const response = await request();

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "That could not be saved.");
        return;
      }

      setMessage(successMessage);
      setEditingId(null);
      setConfirmingDeleteId(null);
      router.refresh();
    });
  }

  /**
   * Save a new address.
   *
   * @param {object} values
   */
  function saveNew(values) {
    run(
      () =>
        fetch("/api/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        }),
      "Address saved.",
    );
  }

  /**
   * Save changes to an existing address.
   *
   * @param {string} addressId
   * @param {object} values
   */
  function saveExisting(addressId, values) {
    run(
      () =>
        fetch(`/api/addresses/${addressId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        }),
      "Address updated.",
    );
  }

  /**
   * Delete an address.
   *
   * @param {string} addressId
   */
  function remove(addressId) {
    run(
      () => fetch(`/api/addresses/${addressId}`, { method: "DELETE" }),
      "Address deleted.",
    );
  }

  /**
   * Make an address the default.
   *
   * @param {string} addressId
   */
  function makeDefault(addressId) {
    run(
      () => fetch(`/api/addresses/${addressId}`, { method: "POST" }),
      "Default address updated.",
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-expired-500/30 bg-expired-50 px-3 py-2.5 text-sm text-expired-800"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="rounded-lg border border-fresh-600/30 bg-fresh-50 px-3 py-2.5 text-sm text-fresh-800"
        >
          {message}
        </p>
      ) : null}

      {addresses.length === 0 ? (
        <div className="rounded-card border border-dashed border-sand-300 bg-white px-6 py-10 text-center">
          <MapPin className="mx-auto size-5 text-sand-400" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-sand-800">
            No delivery address yet
          </p>
          <p className="mt-1 text-sm text-sand-600">
            Add one below so your deliveries know where to go.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {addresses.map((address) => {
            const isEditing = editingId === address.id;
            const isConfirmingDelete = confirmingDeleteId === address.id;

            return (
              <li
                key={address.id}
                className="rounded-card border border-sand-200 bg-white/80 p-4 shadow-soft"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-sand-900">
                        {address.label}
                      </p>

                      {address.isDefault ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-brand-600/20">
                          <Check className="size-3" aria-hidden="true" />
                          Default
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 break-words text-sm leading-relaxed text-sand-600">
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ""}
                    </p>
                    <p className="break-words text-sm leading-relaxed text-sand-600">
                      {address.area}, {address.city}
                    </p>

                    {address.deliveryNotes ? (
                      <p className="mt-1 break-words text-xs text-sand-500">
                        Note: {address.deliveryNotes}
                      </p>
                    ) : null}
                  </div>

                  {/* The three actions wrap onto their own line on a phone
                      rather than being squeezed beside the address. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!address.isDefault ? (
                      <button
                        type="button"
                        onClick={() => makeDefault(address.id)}
                        disabled={isPending}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-sand-600 transition hover:bg-sand-100 hover:text-sand-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Make default
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setMessage(null);
                        setConfirmingDeleteId(null);
                        setEditingId(isEditing ? null : address.id);
                      }}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sand-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sand-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Pencil className="size-3.5 shrink-0" aria-hidden="true" />
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setMessage(null);
                        setEditingId(null);
                        setConfirmingDeleteId(
                          isConfirmingDelete ? null : address.id,
                        );
                      }}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sand-200 bg-white px-2.5 py-1.5 text-xs font-medium text-expired-700 transition hover:bg-expired-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="size-3.5 shrink-0" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </div>

                {/* ── Edit panel ─────────────────────────────────────── */}
                {isEditing ? (
                  <div className="mt-4 border-t border-sand-100 pt-4">
                    <AddressForm
                      initialValues={address}
                      onSubmit={(values) => saveExisting(address.id, values)}
                      isPending={isPending}
                      error={null}
                      submitLabel="Save changes"
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : null}

                {/* ── Delete confirmation ────────────────────────────── */}
                {isConfirmingDelete ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-expired-500/30 bg-expired-50 px-3 py-2.5">
                    <p className="text-sm text-expired-800">
                      Delete this address? You can add it again, but saved
                      orders keep their own copy.
                    </p>

                    <button
                      type="button"
                      onClick={() => remove(address.id)}
                      disabled={isPending}
                      className="rounded-lg bg-expired-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-expired-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending ? "Deleting…" : "Yes, delete it"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(null)}
                      disabled={isPending}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-sand-600 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Keep it
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Add panel ───────────────────────────────────────────── */}
      {editingId === "new" ? (
        <div className="rounded-card border border-sand-200 bg-white/80 p-4 shadow-soft">
          <h3 className="text-sm font-semibold text-sand-900">
            Add another address
          </h3>

          <div className="mt-3">
            <AddressForm
              onSubmit={saveNew}
              isPending={isPending}
              error={null}
              submitLabel="Save address"
              onCancel={() => setEditingId(null)}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMessage(null);
            setConfirmingDeleteId(null);
            setEditingId("new");
          }}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sand-200 bg-white px-3.5 py-2 text-sm font-semibold text-sand-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add another address
        </button>
      )}
    </div>
  );
}
