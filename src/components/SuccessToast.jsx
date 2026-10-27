"use client";

import { CheckCircle2, X } from "lucide-react";

/**
 * SuccessToast — a transient confirmation that an order was placed.
 *
 * The toast is announced politely to assistive technology (`role="status"`)
 * so a screen-reader user learns the order went through without the
 * navigation stealing their focus mid-announcement.
 *
 * It sits above the page content, bottom-centre on small screens and
 * bottom-right on large ones, and it dismisses itself after a few seconds.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {() => void} [props.onDismiss]
 */
export default function SuccessToast({ title, message, onDismiss }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-6 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:justify-end"
    >
      <div className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-white/40 bg-white/90 p-4 shadow-xl backdrop-blur-md">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fresh-50 text-fresh-600 ring-1 ring-inset ring-fresh-600/20">
          <CheckCircle2 className="size-4" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sand-900">{title}</p>
          {message ? (
            <p className="mt-0.5 text-sm leading-relaxed text-sand-600">
              {message}
            </p>
          ) : null}
        </div>

        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="-mr-1 -mt-1 rounded-lg p-1 text-sand-400 transition hover:bg-sand-100 hover:text-sand-600"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
