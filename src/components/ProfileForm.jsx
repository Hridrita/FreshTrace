"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

/**
 * ProfileForm — edit the customer's display name.
 *
 * The email is shown but not editable: it is the account's identity, and
 * changing it would need a re-verification round trip the app does not
 * have. Only the name is written.
 *
 * @param {object} props
 * @param {{ name: string | null, email: string }} props.profile
 */
export default function ProfileForm({ profile }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  /**
   * Save the profile.
   *
   * @param {object} event
   */
  function submit(event) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();

    startTransition(async () => {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "Your profile could not be saved.");
        return;
      }

      setMessage("Your details have been saved.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="block text-xs font-medium text-sand-600">
          Full name
        </span>
        <input
          type="text"
          name="name"
          defaultValue={profile.name ?? ""}
          placeholder="Your name"
          minLength={2}
          maxLength={120}
          required
          className="mt-1 w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-sand-600">Email</span>
        <input
          type="email"
          name="email"
          value={profile.email}
          readOnly
          aria-describedby="email-hint"
          className="mt-1 w-full cursor-not-allowed rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-sm text-sand-500"
        />
        <span id="email-hint" className="mt-1 block text-xs text-sand-500">
          Your email identifies your account and cannot be changed here.
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-expired-500/30 bg-expired-50 px-3 py-2 text-sm text-expired-800"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="rounded-lg border border-fresh-600/30 bg-fresh-50 px-3 py-2 text-sm text-fresh-800"
        >
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Save className="size-4" aria-hidden="true" />
        {isPending ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}
