import {
  PackageCheck,
  RotateCcw,
  ShoppingBag,
} from "lucide-react";
import {
  DataTable,
  EmptyState,
  FilterBar,
  FilterSelect,
  FilterSubmit,
  Panel,
  SearchInput,
  StatusPill,
} from "@/components/admin/AdminUI";
import OrderStatusControl from "@/components/admin/OrderStatusControl";
import RefundDecisionControl from "@/components/admin/RefundDecisionControl";
import {
  ORDER_STATUS_TONE,
  ORDER_TRANSITIONS,
  listOrdersForAdmin,
  listRefunds,
} from "@/lib/services/admin-orders";
import { formatBDT, formatDate, formatQty } from "@/lib/freshness";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "@/lib/constants";

/**
 * Order & refund operations — `/app/admin/orders`.
 *
 * Two queues on one page, because they are the same conversation: a
 * fulfilment problem and a refund request are both "a customer is waiting
 * on us". The order table carries the fulfilment control, and the refund
 * table carries the decision.
 */

/** @type {import("next").Metadata} */
export const metadata = {
  title: "Orders & refunds",
  description: "Manage customer orders, fulfilment status, and refund requests.",
};

export default async function AdminOrdersPage({ searchParams }) {
  const params = await searchParams;

  const status = typeof params?.status === "string" ? params.status : "";
  const paymentStatus = typeof params?.paymentStatus === "string" ? params.paymentStatus : "";
  const search = typeof params?.search === "string" ? params.search : "";

  const [orders, refunds] = await Promise.all([
    listOrdersForAdmin({
      status: status || undefined,
      paymentStatus: paymentStatus || undefined,
      search: search || undefined,
      limit: 100,
    }),
    listRefunds({ limit: 50 }),
  ]);

  return (
    <div className="space-y-6">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-sand-900 sm:text-3xl">
          Orders &amp; refunds
        </h1>
        <p className="mt-1.5 text-sm text-sand-600">
          Track fulfilment, and settle the refund and replacement requests the
          team owes a customer.
        </p>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <FilterBar action="/app/admin/orders">
        <SearchInput
          defaultValue={search}
          placeholder="Search order code or customer…"
        />
        <FilterSelect
          name="status"
          label="Order status"
          defaultValue={status}
          allLabel="All statuses"
          options={ORDER_STATUSES.map((value) => ({
            value,
            label: ORDER_STATUS_TONE[value]?.label ?? value,
          }))}
        />
        <FilterSelect
          name="paymentStatus"
          label="Payment status"
          defaultValue={paymentStatus}
          allLabel="All payment states"
          options={PAYMENT_STATUSES.map((value) => ({
            value,
            label: value.charAt(0).toUpperCase() + value.slice(1),
          }))}
        />
        <FilterSubmit />
      </FilterBar>

      {/* ── Refund queue ───────────────────────────────────────────── */}
      <Panel
        title="Refund &amp; replacement queue"
        description="Each request is reconciled against its order before it can be settled."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-800">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {refunds.length} open
          </span>
        }
      >
        {refunds.length === 0 ? (
          <EmptyState
            icon={<PackageCheck className="size-6" aria-hidden="true" />}
            title="No open refund requests"
            description="Every refund request has been decided. New ones will queue up here."
          />
        ) : (
          <DataTable
            columns={[
              {
                key: "order",
                label: "Order",
                className: "font-medium text-sand-900",
              },
              { key: "customer", label: "Customer" },
              { key: "reason", label: "Reason" },
              { key: "items", label: "Items", align: "right" },
              { key: "amount", label: "Amount", align: "right" },
              { key: "requested", label: "Requested" },
              { key: "decision", label: "Decision", align: "right" },
            ]}
            rows={refunds.map((refund) => ({
              key: refund.id,
              order: (
                <p className="font-mono text-[13px] text-sand-900">
                  {refund.order.orderCode}
                </p>
              ),
              customer: (
                <div>
                  <p className="break-words text-sand-800">
                    {refund.order.customer?.name ?? refund.order.customer?.email ?? "—"}
                  </p>
                  {refund.requester?.role ? (
                    <p className="text-[11px] text-sand-500">
                      Requested by {refund.requester.role.replace(/_/g, " ")}
                    </p>
                  ) : null}
                </div>
              ),
              reason: (
                <span className="line-clamp-2 block max-w-[16rem] break-words text-xs text-sand-600">
                  {refund.reason}
                </span>
              ),
              items: (
                <span className="text-xs text-sand-500">
                  {refund.items.length} line{refund.items.length === 1 ? "" : "s"}
                </span>
              ),
              amount: (
                <span className="font-medium text-sand-900">{formatBDT(refund.amount)}</span>
              ),
              requested: formatDate(refund.createdAt),
              decision: (
                <RefundDecisionControl
                  refundId={refund.id}
                  orderCode={refund.order.orderCode}
                  amount={formatBDT(refund.amount)}
                />
              ),
            }))}
          />
        )}
      </Panel>

      {/* ── Order table ────────────────────────────────────────────── */}
      <Panel
        title="Order fulfilment"
        description={`${orders.length} order${orders.length === 1 ? "" : "s"} matching the current filters.`}
      >
        {orders.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="size-6" aria-hidden="true" />}
            title="No orders match"
            description="Adjust the filters above to widen the search."
          />
        ) : (
          <DataTable
            columns={[
              {
                key: "order",
                label: "Order",
                className: "font-medium text-sand-900",
              },
              { key: "customer", label: "Customer" },
              { key: "items", label: "Items" },
              { key: "total", label: "Total", align: "right" },
              { key: "payment", label: "Payment" },
              { key: "status", label: "Status" },
              { key: "fulfilment", label: "Fulfilment", align: "right" },
            ]}
            rows={orders.map((order) => {
              const presentation = ORDER_STATUS_TONE[order.status] ?? {
                label: order.status,
                tone: "neutral",
              };

              return {
                key: order.id,
                order: (
                  <div>
                    <p className="font-mono text-[13px] text-sand-900">{order.orderCode}</p>
                    <p className="text-[11px] text-sand-500">
                      {formatDate(order.placedAt)}
                    </p>
                  </div>
                ),
                customer: (
                  <div>
                    <p className="break-words text-sand-800">
                      {order.customer?.name ?? order.customer?.email ?? "—"}
                    </p>
                    {order.customer?.phone ? (
                      <p className="text-[11px] text-sand-500">{order.customer.phone}</p>
                    ) : null}
                  </div>
                ),
                items: (
                  <div>
                    <p className="text-xs text-sand-700">
                      {order.items.length} item{order.items.length === 1 ? "" : "s"}
                    </p>
                    <p className="text-[11px] text-sand-500">
                      {order.items
                        .slice(0, 2)
                        .map((item) => `${formatQty(item.qty)} kg`)
                        .join(" · ")}
                    </p>
                  </div>
                ),
                total: (
                  <span className="font-medium text-sand-900">
                    {formatBDT(order.grandTotal)}
                  </span>
                ),
                payment: (
                  <StatusPill
                    label={order.paymentStatus.replace(/_/g, " ")}
                    tone={
                      order.paymentStatus === "paid"
                        ? "success"
                        : order.paymentStatus === "refunded" ||
                            order.paymentStatus === "partially_refunded"
                          ? "warn"
                          : order.paymentStatus === "failed"
                            ? "danger"
                            : "neutral"
                    }
                  />
                ),
                status: (
                  <StatusPill label={presentation.label} tone={presentation.tone} />
                ),
                fulfilment: (
                  <OrderStatusControl
                    orderId={order.id}
                    currentStatus={order.status}
                    allowedStatuses={ORDER_TRANSITIONS[order.status] ?? []}
                  />
                ),
              };
            })}
          />
        )}
      </Panel>
    </div>
  );
}
