"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Thermometer, X } from "lucide-react";

/**
 * The QC inspection form.
 *
 * The operator picks a batch from the queue, records what they saw at the
 * hub, and the server writes the inspection log and re-prices the batch.
 *
 * The form reflects the domain rules rather than leaving them to the
 * operator:
 *
 * - The visual grade is a radio group of `Fresh` / `Good` / `Fair` (A / B /
 *   C). Grade `C` is a failed inspection, so choosing it switches the
 *   outcome to *Failed* automatically.
 * - The verified weight is required and must be positive.
 * - Photos are added as URLs, because the app has no upload service in v1.
 *   Each URL is a text field with a remove control.
 */
const GRADES = [
  {
    value: "A",
    label: "Fresh",
    hint: "Market-grade, no visible blemishes.",
  },
  {
    value: "B",
    label: "Good",
    hint: "Minor marks; still sells at the fair tier.",
  },
  {
    value: "C",
    label: "Fair",
    hint: "Damaged or spoiled — fails inspection.",
  },
];

export default function QcInspectionForm({ batches }) {
  const router = useRouter();

  const [batchId, setBatchId] = useState(batches[0]?.id ?? "");
  const [grade, setGrade] = useState("A");
  const [weightKg, setWeightKg] = useState("");
  const [temperatureC, setTemperatureC] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([""]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  // Grade C is a failed inspection by definition — the grade is the
  // evidence, so the outcome follows it rather than the other way round.
  const passed = grade !== "C";

  const selectedBatch = batches.find((batch) => batch.id === batchId);

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting) return;

    setError("");
    setSuccess("");

    const weight = Number(weightKg);

    if (!batchId) {
      setError("Choose a batch to inspect.");
      return;
    }

    if (!Number.isFinite(weight) || weight <= 0) {
      setError("Enter the verified weight in kilograms.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/qc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          grade,
          weightKg: weight,
          temperatureC:
            temperatureC.trim() === "" ? undefined : Number(temperatureC),
          notes,
          photos: photos.map((photo) => photo.trim()).filter(Boolean),
          passed,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? "The inspection could not be saved.");
        setSubmitting(false);
        return;
      }

      const adjustment = payload?.data?.adjustment;

      setSuccess(
        `Inspection logged. Batch re-priced to the ${adjustment?.tier ?? "current"} tier at ${Math.round(
          (adjustment?.multiplier ?? 1) * 100,
        )}% of base price.`,
      );

      // Reset the form for the next batch, keeping the queue in view.
      setWeightKg("");
      setTemperatureC("");
      setNotes("");
      setPhotos([""]);
      setGrade("A");
      setSubmitting(false);

      router.refresh();
    } catch {
      setError("Could not reach the server. Try again in a moment.");
      setSubmitting(false);
    }
  }

  if (batches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-sand-300 bg-white/50 px-5 py-10 text-center">
        <p className="text-sm font-medium text-sand-700">
          No batches are waiting for inspection.
        </p>
        <p className="mt-1 text-xs text-sand-500">
          Incoming aggregator batches will appear here as they arrive at the hub.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-expired-600/20 bg-expired-50/90 px-3.5 py-3 text-sm text-expired-800"
        >
          {error}
        </p>
      ) : null}

      {success ? (
        <p
          role="status"
          className="rounded-2xl border border-fresh-600/20 bg-fresh-50/90 px-3.5 py-3 text-sm text-fresh-800"
        >
          {success}
        </p>
      ) : null}

      {/* ── Batch ──────────────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-sand-700">Batch</span>
        <select
          value={batchId}
          onChange={(event) => setBatchId(event.target.value)}
          required
          className="w-full rounded-2xl border border-sand-200 bg-white/80 px-3.5 py-2.5 text-sm text-sand-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200/60"
        >
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.batchCode} — {batch.product.name} ({batch.originDistrict},{" "}
              {batch.inboundQty} kg)
            </option>
          ))}
        </select>
      </label>

      {/* ── Visual grade ───────────────────────────────────────────── */}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-sand-700">Visual grade</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {GRADES.map((option) => {
            const active = grade === option.value;
            return (
              <label
                key={option.value}
                className={`cursor-pointer rounded-2xl border p-3 transition ${
                  active
                    ? "border-brand-500 bg-brand-50 shadow-soft"
                    : "border-sand-200 bg-white/70 hover:bg-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="grade"
                    value={option.value}
                    checked={active}
                    onChange={() => setGrade(option.value)}
                    className="size-4 accent-brand-600"
                  />
                  <span className="text-sm font-semibold text-sand-900">{option.label}</span>
                </span>
                <span className="mt-1 block pl-6 text-[11px] leading-snug text-sand-500">
                  {option.hint}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* ── Weight & temperature ───────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-sand-700">
            Verified weight (kg)
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={weightKg}
            onChange={(event) => setWeightKg(event.target.value)}
            required
            placeholder={selectedBatch ? String(selectedBatch.inboundQty) : "0.00"}
            className="w-full rounded-2xl border border-sand-200 bg-white/80 px-3.5 py-2.5 text-sm text-sand-800 outline-none transition placeholder:text-sand-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200/60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-sand-700">
            <Thermometer className="size-3.5 text-sand-400" aria-hidden="true" />
            Temperature (°C)
          </span>
          <input
            type="number"
            step="0.1"
            value={temperatureC}
            onChange={(event) => setTemperatureC(event.target.value)}
            placeholder="Optional"
            className="w-full rounded-2xl border border-sand-200 bg-white/80 px-3.5 py-2.5 text-sm text-sand-800 outline-none transition placeholder:text-sand-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200/60"
          />
        </label>
      </div>

      {/* ── Notes ──────────────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-sand-700">Notes</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="What did you see at the bench?"
          className="w-full resize-y rounded-2xl border border-sand-200 bg-white/80 px-3.5 py-2.5 text-sm text-sand-800 outline-none transition placeholder:text-sand-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200/60"
        />
      </label>

      {/* ── Photos ─────────────────────────────────────────────────── */}
      <fieldset>
        <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-sand-700">
          <Camera className="size-3.5 text-sand-400" aria-hidden="true" />
          Photos
        </legend>

        <div className="space-y-2">
          {photos.map((photo, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="url"
                value={photo}
                onChange={(event) =>
                  setPhotos((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  )
                }
                placeholder="https://… photo URL"
                className="w-full rounded-2xl border border-sand-200 bg-white/80 px-3.5 py-2 text-sm text-sand-800 outline-none transition placeholder:text-sand-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200/60"
              />
              {photos.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                  className="shrink-0 rounded-full p-2 text-sand-400 transition hover:bg-sand-100 hover:text-sand-700"
                  aria-label="Remove photo"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setPhotos((current) => [...current, ""])}
          className="mt-2.5 rounded-full border border-sand-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-sand-600 transition hover:bg-white hover:text-sand-900"
        >
          Add another photo
        </button>
      </fieldset>

      {/* ── Outcome ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-2xl border border-sand-200/80 bg-sand-50/70 px-3.5 py-3">
        <span
          className={`size-2 shrink-0 rounded-full ${
            passed ? "bg-fresh-500" : "bg-expired-500"
          }`}
          aria-hidden="true"
        />
        <p className="text-xs text-sand-600">
          {passed ? (
            <>
              This inspection <strong className="font-semibold text-fresh-800">passes</strong>. The
              batch is listed and priced by the freshness engine.
            </>
          ) : (
            <>
              This inspection <strong className="font-semibold text-expired-800">fails</strong>. The
              batch is written off and delisted.
            </>
          )}
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Saving inspection…
          </>
        ) : (
          "Log inspection &amp; re-price"
        )}
      </button>
    </form>
  );
}
