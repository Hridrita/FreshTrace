/**
 * Seed operational data for the admin & QC panel.
 *
 * The main seed (`prisma/seed.js`) creates catalogue, batch and
 * subscription data but no orders or refunds, so the operations panel's
 * order and refund queues would be empty on a fresh database.
 *
 * This script creates a small, realistic set of orders and refund requests
 * so the panel can be exercised end to end.
 *
 * Usage: node scratch/seed-admin-ops.js
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const customers = await prisma.user.findMany({
    where: { role: "customer" },
    include: { addresses: true },
  });

  if (customers.length === 0) {
    console.error("No customers found. Run `npm run db:seed` first.");
    process.exit(1);
  }

  const batches = await prisma.batch.findMany({
    where: { status: "listed", availableQty: { gt: 1 } },
    include: { product: true },
    orderBy: { availableQty: "desc" },
    take: 6,
  });

  if (batches.length === 0) {
    console.error("No listed batches found. Run `npm run db:seed` first.");
    process.exit(1);
  }

  const statuses = ["paid", "in_fulfillment", "in_transit", "delivered", "pending_payment"];

  let created = 0;

  for (let index = 0; index < customers.length; index += 1) {
    const customer = customers[index];
    const address = customer.addresses[0];

    if (!address) continue;

    const batch = batches[index % batches.length];
    const qty = Math.min(1.5, batch.availableQty);
    const unitPrice = Math.round(batch.product.baseUnitPrice * batch.currentPriceMultiplier);
    const lineTotal = Math.round(unitPrice * qty);
    const deliveryFee = 60;
    const status = statuses[index % statuses.length];

    const placedAt = new Date(Date.now() - (index + 1) * 36 * 3_600_000);
    const shifted = new Date(placedAt.getTime() + 6 * 3_600_000);
    const datePart = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;

    const orderCode = `FT-ORD-${datePart}-${String(index + 1).padStart(4, "0")}`;

    // Idempotent: the order code is derived from the customer index, so a
    // re-run would collide with the unique constraint. Skip instead.
    const clash = await prisma.order.findUnique({ where: { orderCode } });
    if (clash) {
      continue;
    }

    const order = await prisma.order.create({
      data: {
        orderCode,        customerId: customer.id,
        addressSnapshot: JSON.stringify({
          label: address.label,
          line1: address.line1,
          area: address.area,
          city: address.city,
        }),
        subtotal: lineTotal,
        deliveryFee,
        grandTotal: lineTotal + deliveryFee,
        paymentStatus: status === "pending_payment" ? "pending" : "paid",
        paymentMethod: "card",
        status,
        placedAt,
        paidAt: status === "pending_payment" ? null : placedAt,
        deliveredAt: status === "delivered" ? new Date(placedAt.getTime() + 86_400_000) : null,
        items: {
          create: [
            {
              batchId: batch.id,
              name: batch.product.name,
              qty,
              unitPrice,
              lineTotal,
              freshnessTierAtOrder: batch.currentTier ?? "fresh",
            },
          ],
        },
      },
      include: { items: true },
    });

    created += 1;

    // Attach a delivery row to the orders that are physically moving.
    if (["in_transit", "delivered", "in_fulfillment"].includes(status)) {
      await prisma.delivery.create({
        data: {
          orderId: order.id,
          courier: "pathao",
          courierStatus:
            status === "delivered" ? "delivered" : status === "in_transit" ? "in_transit" : "picked_up",
          courierTrackingId: `TRK${String(index + 1).padStart(8, "0")}`,
          pickedUpAt: status === "pending_payment" ? null : placedAt,
          deliveredAt: status === "delivered" ? new Date(placedAt.getTime() + 86_400_000) : null,
        },
      });
    }

    // Raise a refund request on the delivered order, so the refund queue
    // has something in it.
    if (status === "delivered") {
      const item = order.items[0];

      await prisma.refund.create({
        data: {
          orderId: order.id,
          requestedBy: customer.id,
          requestedByRole: "customer",
          reason: "Two mangoes were bruised on arrival.",
          amount: item.lineTotal,
          status: "requested",
          items: {
            create: [
              {
                orderItemId: item.id,
                qty: item.qty,
                amount: item.lineTotal,
              },
            ],
          },
        },
      });
    }
  }

  console.log(`✓ created ${created} orders and their deliveries`);
  console.log(`✓ refund requests raised for the delivered orders`);

  await seedSubscriptions();
}

/**
 * Create a spread of subscriptions across the plans.
 *
 * The catalogue seed creates the *plans* but no *subscriptions*, so the
 * subscriptions register would otherwise only ever show its empty state.
 * A mix of active, paused and ended gives the plan-mix panel something
 * to aggregate and exercises the status filter.
 *
 * @returns {Promise<void>}
 */
async function seedSubscriptions() {
  const existing = await prisma.subscription.count();
  if (existing > 0) {
    console.log(`✓ ${existing} subscriptions already present — skipping`);
    return;
  }

  const customers = await prisma.user.findMany({
    where: { role: "customer" },
    include: { addresses: true },
  });

  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { weeklyPrice: "asc" },
  });

  const statuses = ["active", "active", "active", "paused", "ended"];

  let created = 0;

  for (let index = 0; index < customers.length; index += 1) {
    const customer = customers[index];
    const address = customer.addresses[0];
    if (!address) continue;

    const plan = plans[index % plans.length];
    const status = statuses[index % statuses.length];

    // Spread the delivery day across the week so the schedule reads like a
    // real roster rather than a single repeating slot.
    const dayOfWeek = index % 7;

    // Next delivery on the coming occurrence of that weekday.
    const now = new Date();
    const daysAhead = (dayOfWeek - now.getDay() + 7) % 7 || 7;
    const nextDeliveryAt = new Date(now);
    nextDeliveryAt.setDate(now.getDate() + daysAhead);
    nextDeliveryAt.setHours(7, 0, 0, 0);

    await prisma.subscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        addressId: address.id,
        dayOfWeek,
        status,
        nextDeliveryAt,
        startedAt: new Date(now.getTime() - (index + 1) * 7 * 86_400_000),
        pauseUntil: status === "paused" ? new Date(now.getTime() + 14 * 86_400_000) : null,
        endedAt: status === "ended" ? new Date(now.getTime() - 3 * 86_400_000) : null,
      },
    });

    created += 1;
  }

  console.log(`✓ created ${created} subscriptions across ${plans.length} plans`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
