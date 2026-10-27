/**
 * OrderStatusBadge — the lifecycle state of an order.
 *
 * The order lifecycle is one of seven states (SRS §4.10). The badge colours
 * run from the neutral "waiting" tone through the brand green to the
 * alarming red, so a customer can read an order's state at a glance.
 */

/**
 * @typedef {object} StatusPresentation
 * @property {string} label
 * @property {string} badgeClass
 */

/**
 * Presentation for each order status.
 *
 * @type {Record<string, StatusPresentation>}
 */
export const ORDER_STATUS_PRESENTATION = {
  pending_payment: {
    label: "Awaiting payment",
    badgeClass: "bg-sand-100 text-sand-700 ring-sand-500/20",
  },
  paid: {
    label: "Paid",
    badgeClass: "bg-brand-50 text-brand-800 ring-brand-600/20",
  },
  in_fulfillment: {
    label: "Being packed",
    badgeClass: "bg-good-50 text-good-800 ring-good-600/20",
  },
  in_transit: {
    label: "On the way",
    badgeClass: "bg-good-50 text-good-800 ring-good-600/20",
  },
  delivered: {
    label: "Delivered",
    badgeClass: "bg-fresh-50 text-fresh-800 ring-fresh-600/20",
  },
  cancelled: {
    label: "Cancelled",
    badgeClass: "bg-expired-50 text-expired-800 ring-expired-600/20",
  },
  refunded: {
    label: "Refunded",
    badgeClass: "bg-near-expiry-50 text-near-expiry-800 ring-near-expiry-600/20",
  },
};

/**
 * Get the presentation for an order status.
 *
 * @param {string | null | undefined} status
 * @returns {StatusPresentation}
 */
export function getOrderStatusPresentation(status) {
  if (typeof status === "string" && status in ORDER_STATUS_PRESENTATION) {
    return ORDER_STATUS_PRESENTATION[status];
  }

  return {
    label: "Unknown",
    badgeClass: "bg-sand-100 text-sand-700 ring-sand-500/20",
  };
}

/**
 * OrderStatusBadge — renders an order's lifecycle state.
 *
 * @param {object} props
 * @param {string} props.status
 */
export default function OrderStatusBadge({ status }) {
  const presentation = getOrderStatusPresentation(status);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${presentation.badgeClass}`}
    >
      {presentation.label}
    </span>
  );
}
