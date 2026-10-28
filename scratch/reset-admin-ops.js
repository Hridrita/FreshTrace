/**
 * Reset the operations data so the admin smoke checks start from a known
 * state.
 *
 * Clears orders, deliveries and refunds, then restores one batch to
 * `in_transit` so the QC inspection check always has a subject.
 *
 * Usage: node scratch/reset-admin-ops.js
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  await prisma.refund.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();

  const batch = await prisma.batch.findFirst({
    where: { status: { in: ["delisted", "listed", "in_transit"] } },
    orderBy: { createdAt: "asc" },
  });

  if (batch) {
    await prisma.batch.update({
      where: { id: batch.id },
      data: { status: "in_transit", qcStatus: "pending" },
    });
  }

  console.log(`✓ operations data reset (batch ${batch ? batch.batchCode : "none"} restored to in_transit)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
