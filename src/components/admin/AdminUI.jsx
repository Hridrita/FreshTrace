/**
 * Admin panel UI primitives.
 *
 * The operations panel shares one visual language with the storefront: a
 * soft white canvas, translucent white "glass" cards, and the same fresh
 * green brand accent. Every component here is a pure presentational
 * primitive — the pages compose them, and the data flows in as props.
 *
 * These are Server-Component-safe (no `"use client"`, no hooks), so a page
 * can render them directly.
 */

/**
 * @typedef {object} Tone
 * @property {string} label
 * @property {string} [textClass]
 * @property {string} [pillClass]
 * @property {string} [dotClass]
 */

/**
 * The tone scale used across the panel.
 *
 * `accent` is the brand green — the panel's own accent, used for
 * positive-but-neutral states like "in progress". The rest reuse the
 * freshness-tier colours so the panel and the storefront speak the same
 * colour language.
 *
 * @type {Record<string, Tone>}
 */
export const TONES = {
  neutral: {
    label: "Neutral",
    textClass: "text-sand-600",
    pillClass: "bg-sand-100 text-sand-700 ring-sand-300/60",
    dotClass: "bg-sand-400",
  },
  accent: {
    label: "Accent",
    textClass: "text-brand-700",
    pillClass: "bg-brand-100 text-brand-800 ring-brand-500/40",
    dotClass: "bg-brand-500",
  },
  success: {
    label: "Success",
    textClass: "text-fresh-700",
    pillClass: "bg-fresh-50 text-fresh-800 ring-fresh-600/20",
    dotClass: "bg-fresh-500",
  },
  info: {
    label: "Info",
    textClass: "text-brand-700",
    pillClass: "bg-brand-50 text-brand-800 ring-brand-600/20",
    dotClass: "bg-brand-500",
  },
  warn: {
    label: "Warning",
    textClass: "text-fair-700",
    pillClass: "bg-fair-50 text-fair-800 ring-fair-600/25",
    dotClass: "bg-fair-500",
  },
  danger: {
    label: "Danger",
    textClass: "text-expired-700",
    pillClass: "bg-expired-50 text-expired-800 ring-expired-600/20",
    dotClass: "bg-expired-500",
  },
};

/**
 * A status pill with a leading dot.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {keyof typeof TONES | string} [props.tone]
 * @param {string} [props.className]
 */
export function StatusPill({ label, tone = "neutral", className = "" }) {
  const t = TONES[tone] ?? TONES.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${t.pillClass} ${className}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${t.dotClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * A KPI card.
 *
 * The card is a frosted white panel with a soft green wash in the corner,
 * so a row of cards reads as one set rather than a grid of boxes. The
 * optional `progress` renders a thin progress bar under the value.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {string} [props.suffix]
 * @param {string} [props.hint]
 * @param {string} [props.icon]  a lucide icon name is not used; the icon is passed as a node
 * @param {import("react").ReactNode} [props.icon]
 * @param {number} [props.progress] 0–100, renders a progress bar
 * @param {string} [props.tone]  a key of {@link TONES}
 */
export function KpiCard({ label, value, suffix, hint, icon, progress, tone = "accent" }) {
  const t = TONES[tone] ?? TONES.accent;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/70 p-5 shadow-soft backdrop-blur-md">
      {/* A soft green wash in the top-right corner. */}
      <div
        className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-brand-200/50 blur-2xl"
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-sand-600">{label}</p>
        {icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100/80 text-brand-700">
            {icon}
          </span>
        ) : null}
      </div>

      <p className="relative mt-3 flex flex-wrap items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight text-sand-900 sm:text-3xl">
          {value}
        </span>
        {suffix ? <span className="text-base font-medium text-sand-500">{suffix}</span> : null}
      </p>

      {progress !== undefined && progress !== null ? (
        <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-sand-200/70">
          <div
            className={`h-full rounded-full transition-all ${t.dotClass}`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} progress`}
          />
        </div>
      ) : null}

      {hint ? <p className="relative mt-2.5 text-xs text-sand-500">{hint}</p> : null}
    </div>
  );
}

/**
 * A compact "progress summary" pill for the dashboard header strip.
 *
 * @param {object} props
 * @param {import("react").ReactNode} props.icon
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {string} [props.tone]
 * @param {string} [props.href]  makes the pill a link
 */
export function ProgressPill({ icon, label, value, tone = "accent", href }) {
  const t = TONES[tone] ?? TONES.accent;

  const content = (
    <>
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full ${t.pillClass}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-sand-500">
          {label}
        </span>
        <span className="block truncate text-sm font-semibold text-sand-900">{value}</span>
      </span>
    </>
  );

  const className = `inline-flex w-full min-w-0 items-center gap-2.5 rounded-full border border-white/70 bg-white/70 py-1.5 pl-1.5 pr-4 shadow-soft backdrop-blur-md`;

  if (href) {
    return (
      <a href={href} className={`${className} transition hover:bg-white/90`}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}

/**
 * The frosted surface every panel section sits on.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {import("react").ReactNode} [props.actions]
 * @param {import("react").ReactNode} props.children
 * @param {string} [props.className]
 */
export function Panel({ title, description, actions, children, className = "" }) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-white/70 bg-white/70 shadow-soft backdrop-blur-md ${className}`}
    >
      {(title || actions) && (
        // The header wraps: the title block takes the full width on a
        // phone and the actions sit below it, rather than being crushed
        // against a long title.
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-sand-100/80 px-5 py-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-base font-semibold tracking-tight text-sand-900">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-sand-500">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      )}

      {children}
    </section>
  );
}

/**
 * The filter bar.
 *
 * A single row of search + dropdown filters, sitting above a data table.
 * The controls are `name`-attributed so the form can be submitted to the
 * server as a plain GET, which keeps the filtered state in the URL and
 * shareable.
 *
 * @param {object} props
 * @param {import("react").ReactNode} props.children
 * @param {string} [props.action]  the form action
 */
export function FilterBar({ children, action = "/app/admin" }) {
  return (
    // The controls wrap onto their own lines on a phone. `items-stretch`
    // keeps a full-width control (the search field) from being squashed by
    // a shorter sibling.
    <form
      action={action}
      className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-white/70 bg-white/70 p-3 shadow-soft backdrop-blur-md"
    >
      {children}
    </form>
  );
}

/**
 * A search input for the filter bar.
 *
 * @param {object} props
 * @param {string} [props.name]
 * @param {string} [props.placeholder]
 * @param {string} [props.defaultValue]
 */
export function SearchInput({
  name = "search",
  placeholder = "Search…",
  defaultValue = "",
}) {
  return (
    // `min-w-0` lets the field shrink inside the wrapping filter bar; the
    // `sm:min-w-[12rem]` floor is what stops it from becoming a sliver on a
    // wider screen. Without the `min-w-0`, the flex item refuses to shrink
    // below its content width and pushes the bar sideways on a phone.
    <div className="relative w-full min-w-0 flex-1 sm:min-w-[12rem]">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sand-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full min-w-0 rounded-full border border-sand-200 bg-white/80 py-2 pl-9 pr-3.5 text-sm text-sand-800 outline-none transition placeholder:text-sand-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200/60"
      />
    </div>
  );
}

/**
 * A dropdown filter for the filter bar.
 *
 * @param {object} props
 * @param {string} props.name
 * @param {string} props.label
 * @param {Array<{ value: string, label: string }>} props.options
 * @param {string} [props.defaultValue]
 * @param {string} [props.allLabel]
 */
export function FilterSelect({
  name,
  label,
  options,
  defaultValue = "",
  allLabel = "All",
}) {
  return (
    // The select fills the filter bar's row on a phone and shrinks to its
    // content from `sm` up. `min-w-0` stops a long option label from
    // forcing the bar to overflow horizontally.
    <label className="inline-flex w-full min-w-0 items-center gap-2 sm:w-auto">
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full min-w-0 appearance-none rounded-full border border-sand-200 bg-white/80 py-2 pl-3.5 pr-8 text-sm text-sand-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200/60 sm:w-auto"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a8a29e' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6' stroke-linecap='round'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.6rem center",
          backgroundSize: "1rem",
        }}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * A filter-bar submit button.
 *
 * @param {object} props
 * @param {string} [props.children]
 */
export function FilterSubmit({ children = "Apply filters" }) {
  return (
    <button
      type="submit"
      className="w-full rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-600 sm:w-auto"
    >
      {children}
    </button>
  );
}

/**
 * A data table.
 *
 * The table is horizontally scrollable on narrow screens rather than
 * collapsing into cards — an operations table is a comparison surface, and
 * the columns have to stay aligned.
 *
 * `minWidth` sets the table's floor. The default suits a full-width panel;
 * a narrow panel (a half-width dashboard queue, say) passes a smaller
 * value so the last column is not clipped off the edge.
 *
 * @param {object} props
 * @param {Array<{ key: string, label: string, className?: string, align?: "left" | "right" | "center" }>} props.columns
 * @param {Array<Record<string, import("react").ReactNode>>} props.rows
 * @param {string} [props.emptyMessage]
 * @param {string} [props.minWidth]
 */
export function DataTable({
  columns,
  rows,
  emptyMessage = "Nothing to show yet.",
  minWidth = "40rem",
}) {
  const alignClass = {
    left: "text-left",
    right: "text-right",
    center: "text-center",
  };

  if (!rows || rows.length === 0) {
    return (
      <div className="px-5 py-14 text-center">
        <p className="text-sm text-sand-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    // `overflow-x-auto` is the scroll container. The negative margin lets
    // the table bleed to the panel's edge on a phone so the scroll is
    // obvious, and the padding restores the visual gutter on the first
    // column.
    <div className="-mx-5 overflow-x-auto px-5">
      <table
        className="w-full border-collapse text-sm"
        style={{ minWidth }}
      >
        <thead>
          <tr className="border-b border-sand-100/80">
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-sand-500 ${
                  alignClass[column.align ?? "left"]
                } ${column.className ?? ""} ${
                  // The first column stays pinned while the rest of the
                  // table scrolls sideways, so the row's identity is never
                  // lost off-screen.
                  index === 0
                    ? "sticky left-0 z-10 bg-white/95 backdrop-blur-sm"
                    : ""
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100/70">
          {rows.map((row, index) => (
            <tr key={row.key ?? index} className="transition hover:bg-white/50">
              {columns.map((column, columnIndex) => (
                <td
                  key={column.key}
                  className={`px-4 py-3 align-middle text-sand-700 ${
                    alignClass[column.align ?? "left"]
                  } ${column.className ?? ""} ${
                    columnIndex === 0
                      ? "sticky left-0 z-10 bg-white/95 backdrop-blur-sm"
                      : ""
                  }`}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * An empty state for a panel.
 *
 * @param {object} props
 * @param {import("react").ReactNode} props.icon
 * @param {string} props.title
 * @param {string} [props.description]
 */
export function EmptyState({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-100/70 text-brand-600">
        {icon}
      </span>
      <h3 className="mt-4 text-sm font-semibold text-sand-900">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-sand-500">{description}</p>
      ) : null}
    </div>
  );
}
