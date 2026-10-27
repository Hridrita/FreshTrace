import { prisma } from "@/lib/prisma";
import { ERROR_CODES, apiError } from "@/lib/errors";

/**
 * Delivery address service.
 *
 * An address belongs to a customer and is used in two places:
 *
 * 1. As a *saved* address, chosen from a list at checkout. A saved address
 *    is reused across orders, and the order copies it into a frozen
 *    snapshot at placement time (SRS §4.10).
 * 2. As an *inline* address, typed once at checkout by a customer who has
 *    never saved one. It is saved like any other address, so the customer
 *    does not have to type it again next time.
 *
 * The first address a customer saves becomes their default. The courier
 * needs a default to fall back on, and a customer with exactly one address
 * has no meaningful choice to make.
 */

/**
 * List a customer's addresses, default first.
 *
 * @param {string} userId
 * @returns {Promise<import("@prisma/client").Address[]>}
 */
export async function listAddresses(userId) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Save a delivery address for a customer.
 *
 * The first address a customer saves becomes their default automatically.
 *
 * @param {string} userId
 * @param {import("@/lib/validation/address").AddressInput} input
 * @returns {Promise<import("@prisma/client").Address>}
 */
export async function createAddress(userId, input) {
  const existingCount = await prisma.address.count({ where: { userId } });

  return prisma.address.create({
    data: {
      userId,
      label: input.label ?? "Home",
      line1: input.line1,
      line2: input.line2 ?? null,
      area: input.area,
      city: input.city ?? "Dhaka",
      deliveryNotes: input.deliveryNotes ?? null,
      // The first address is the default one.
      isDefault: existingCount === 0,
    },
  });
}

/**
 * Fetch one of a customer's addresses.
 *
 * @param {string} userId
 * @param {string} addressId
 * @returns {Promise<import("@prisma/client").Address>}
 */
export async function getAddress(userId, addressId) {
  const address = await prisma.address.findUnique({ where: { id: addressId } });

  // Another customer's address is reported as `not_found`, not `forbidden`,
  // so the response never discloses that it exists.
  if (!address || address.userId !== userId) {
    throw apiError(ERROR_CODES.NOT_FOUND, "That delivery address could not be found.");
  }

  return address;
}

/**
 * Update one of a customer's addresses.
 *
 * The address must belong to the customer — another customer's address is
 * reported as `not_found`, so the response never discloses that it exists.
 *
 * Only the editable fields are written. `isDefault` is left alone here: a
 * customer's default is set when they save their first address, and changing
 * it is a separate decision (see `setDefaultAddress`).
 *
 * @param {string} userId
 * @param {string} addressId
 * @param {import("@/lib/validation/address").AddressInput} input
 * @returns {Promise<import("@prisma/client").Address>}
 */
export async function updateAddress(userId, addressId, input) {
  const address = await getAddress(userId, addressId);

  return prisma.address.update({
    where: { id: address.id },
    data: {
      label: input.label ?? address.label,
      line1: input.line1,
      // An emptied optional field is cleared rather than left as a stale
      // value, so removing a flat number actually removes it. An empty
      // string and a missing field both mean "no value here".
      line2: blankToNull(input.line2),
      area: input.area,
      city: input.city ?? address.city,
      deliveryNotes: blankToNull(input.deliveryNotes),
    },
  });
}

/**
 * Normalise an optional text field to `null` when it is absent or empty.
 *
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
function blankToNull(value) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Make one of a customer's addresses their default.
 *
 * Exactly one address is the default at a time, so the previous default is
 * cleared in the same transaction that sets the new one.
 *
 * @param {string} userId
 * @param {string} addressId
 * @returns {Promise<import("@prisma/client").Address>}
 */
export async function setDefaultAddress(userId, addressId) {
  const address = await getAddress(userId, addressId);

  return prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    return tx.address.update({
      where: { id: address.id },
      data: { isDefault: true },
    });
  });
}

/**
 * Delete one of a customer's addresses.
 *
 * An address referenced by an **active or paused** subscription is protected:
 * the delete is rejected with a conflict that names the subscriptions using
 * it, because deleting it would leave a live delivery with nowhere to go
 * (openspec `subscription-management` — "Address Protection for Active
 * Subscriptions").
 *
 * An address referenced only by *ended* subscriptions can be deleted — the
 * deliveries are already done, so there is nothing left to protect.
 *
 * @param {string} userId
 * @param {string} addressId
 * @returns {Promise<{ id: string }>}
 */
export async function deleteAddress(userId, addressId) {
  const address = await getAddress(userId, addressId);

  const liveSubscriptions = await prisma.subscription.findMany({
    where: {
      customerId: userId,
      addressId: address.id,
      status: { in: ["active", "paused"] },
    },
    select: { id: true, plan: { select: { name: true } } },
  });

  if (liveSubscriptions.length > 0) {
    throw apiError(
      ERROR_CODES.CONFLICT,
      "This address is being used by a subscription. Change the delivery address on the subscription before deleting it.",
      {
        subscriptionIds: liveSubscriptions.map((subscription) => subscription.id),
        plans: liveSubscriptions.map((subscription) => subscription.plan.name),
      },
    );
  }

  await prisma.address.delete({ where: { id: address.id } });

  // The customer may now have no address at all. The default is the address
  // the app falls back on, so the oldest remaining one takes the role.
  const remaining = await prisma.address.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (remaining) {
    await prisma.address.update({
      where: { id: remaining.id },
      data: { isDefault: true },
    });
  }

  return { id: address.id };
}
