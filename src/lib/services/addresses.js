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
