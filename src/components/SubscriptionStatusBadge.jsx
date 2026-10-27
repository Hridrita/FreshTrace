/**
 * SubscriptionStatusBadge — the lifecycle state of a subscription.
 *
 * The subscription lifecycle is three states (SRS §4.8): `active`, `paused`
 * and `ended`. The colours run from the brand green for a live plan through
 * the amber of a pause to the neutral grey of an ended one, so a customer can
 * read the state at a glance.
 */

/**
 * @typedef {object} StatusPresentation
 * @property {string} label
 * @property {string} badgeClass
 */

/**
 * Presentation for each subscription status.
 *
 * @type {Record<string, StatusPresentation>}
 */
export const SUBSCRIPTION_STATUS_PRESENTATION = {
  active: {
    label: "Active",
    badgeClass: "bg-fresh-50 text-fresh-800 ring-fresh-600/20",
  },
  paused: {
    label: "Paused",
    badgeClass: "bg-near-expiry-50 text-near-expiry-800 ring-near-expiry-600/20",
  },
  ended: {
    label: "Ended",
    badgeClass: "bg-sand-100 text-sand-700 ring-sand-500/20",
  },
};

/**
 * Get the presentation for a subscription status.
 *
 * @param {string | null | undefined} status
 * @returns {StatusPresentation}
 */
export function getSubscriptionStatusPresentation(status) {
  if (typeof status === "string" && status in SUBSCRIPTION_STATUS_PRESENTATION) {
    return SUBSCRIPTION_STATUS_PRESENTATION[status];
  }

  return {
    label: "Unknown",
    badgeClass: "bg-sand-100 text-sand-700 ring-sand-500/20",
  };
}

/**
 * SubscriptionStatusBadge — renders a subscription's lifecycle state.
 *
 * @param {object} props
 * @param {string} props.status
 */
export default function SubscriptionStatusBadge({ status }) {
  const presentation = getSubscriptionStatusPresentation(status);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${presentation.badgeClass}`}
    >
      {presentation.label}
    </span>
  );
}
