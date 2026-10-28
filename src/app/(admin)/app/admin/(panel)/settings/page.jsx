import { KeyRound, SlidersHorizontal, Sprout } from "lucide-react";
import { Panel, StatusPill } from "@/components/admin/AdminUI";
import { getAdminEmail, getAdminPassword } from "@/lib/admin/auth";
import { getMultipliers } from "@/lib/decay/constants";
import { TIER_BOUNDARIES } from "@/lib/decay/constants";

/**
 * Admin settings — `/app/admin/settings`.
 *
 * This page is **read-only** in v1. The settings that matter — the admin
 * credential and the freshness multipliers — are environment variables, not
 * database rows, so they are set on the deployment rather than through a
 * form. Editing them from a browser would mean persisting a secret into
 * the database, which is a worse place to keep it than the environment.
 *
 * Showing the effective values is still useful: it tells the operator which
 * rule the pricing engine is actually running with, which is the question
 * they usually have.
 */

/** @type {import("next").Metadata} */
export const metadata = {
  title: "Settings",
  description: "Effective admin configuration and pricing engine parameters.",
};

/**
 * Mask a secret for display.
 *
 * Only the length is revealed — enough to tell whether a password is set
 * without putting the value on the screen.
 *
 * @param {string} secret
 * @returns {string}
 */
function maskSecret(secret) {
  if (!secret) return "Not set";
  return `•`.repeat(Math.min(secret.length, 16));
}

export default function AdminSettingsPage() {
  const multipliers = getMultipliers();
  const adminEmail = getAdminEmail();
  const adminPassword = getAdminPassword();

  return (
    <div className="space-y-6">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-sand-900 sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1.5 text-sm text-sand-600">
          The effective configuration this operations panel is running with.
        </p>
      </div>

      {/* ── Admin credential ───────────────────────────────────────── */}
      <Panel
        title="Admin credential"
        description="Access to this panel. Set on the deployment, not in the database."
      >
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <KeyRound className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-sand-900">{adminEmail}</p>
                <p className="text-xs text-sand-500">
                  Set by <code className="font-mono text-[11px]">ADMIN_EMAIL</code>
                </p>
              </div>
            </div>
            <StatusPill label="Active" tone="success" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <KeyRound className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-mono text-sm text-sand-900">{maskSecret(adminPassword)}</p>
                <p className="text-xs text-sand-500">
                  Set by <code className="font-mono text-[11px]">ADMIN_PASSWORD</code>
                </p>
              </div>
            </div>
            <StatusPill label="Configured" tone="success" />
          </div>

          <p className="rounded-2xl border border-fair-600/25 bg-fair-50/80 px-4 py-3 text-xs leading-relaxed text-fair-800">
            These values are fixed credentials for a single operations account. Change
            them in the deployment environment and redeploy — there is no in-app
            editor, so a secret is never written into the database.
          </p>
        </div>
      </Panel>

      {/* ── Pricing engine ─────────────────────────────────────────── */}
      <Panel
        title="Freshness &amp; pricing engine"
        description="The rule-based decay curve. The same engine prices the customer catalogue."
      >
        <div className="px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </span>
            <p className="text-sm text-sand-700">
              Tier boundaries are fixed by the decay engine; the multipliers below can
              be tuned per deployment.
            </p>
          </div>

          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                tier: "Fresh",
                days: `Day 0–${TIER_BOUNDARIES.good - 1}`,
                multiplier: multipliers.fresh,
                env: "DECAY_DAY1_MULTIPLIER",
                tone: "success",
              },
              {
                tier: "Good",
                days: `Day ${TIER_BOUNDARIES.good}–${TIER_BOUNDARIES.fair - 1}`,
                multiplier: multipliers.good,
                env: "DECAY_DAY3_MULTIPLIER",
                tone: "info",
              },
              {
                tier: "Fair",
                days: `Day ${TIER_BOUNDARIES.fair}–${TIER_BOUNDARIES.nearExpiry - 1}`,
                multiplier: multipliers.fair,
                env: "DECAY_DAY5_MULTIPLIER",
                tone: "warn",
              },
              {
                tier: "Near expiry",
                days: `Day ${TIER_BOUNDARIES.nearExpiry}+`,
                multiplier: multipliers.near_expiry,
                env: "DECAY_NEAR_EXPIRY_MULTIPLIER",
                tone: "danger",
              },
            ].map((row) => (
              <li
                key={row.tier}
                className="rounded-2xl border border-white/70 bg-white/60 px-4 py-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <StatusPill label={row.tier} tone={row.tone} />
                  <span className="text-sm font-semibold text-sand-900">
                    {Math.round(row.multiplier * 100)}%
                  </span>
                </div>
                <p className="mt-2 text-xs text-sand-500">{row.days}</p>
                <p className="mt-1 font-mono text-[10px] text-sand-400">{row.env}</p>
              </li>
            ))}
          </ul>

          <p className="mt-4 flex items-start gap-2 text-xs text-sand-500">
            <Sprout className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            A batch is delisted once it passes its product&apos;s shelf life
            (<code className="font-mono text-[11px]">harvestToShelfDays</code>), and
            expired stock is never relisted.
          </p>
        </div>
      </Panel>
    </div>
  );
}
