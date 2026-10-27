import { prisma } from "@/lib/prisma";

/**
 * Profile service.
 *
 * A customer's profile is deliberately small: a display name and an email.
 * The email is the account's identity and is never edited — changing it
 * would need a re-verification round trip the app does not have (SRS §3.1
 * registers the account against an email; SRS §3.5 covers password resets).
 *
 * Only the fields the account page offers are writable. `role`, `status`
 * and the aggregator-only fields are managed elsewhere and are not
 * reachable from here.
 */

/**
 * The fields of a customer profile that are safe to show and to edit.
 *
 * The `User` row also carries `passwordHash` and `resetTokenHash`; neither
 * may ever leave the server, so reads select fields explicitly rather than
 * returning the whole row.
 *
 * @type {const}
 */
export const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
};

/**
 * Read a customer's profile.
 *
 * @param {string} userId
 * @returns {Promise<import("@prisma/client").User | null>}
 */
export async function getProfile(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { ...PROFILE_SELECT },
  });
}

/**
 * Update a customer's display name.
 *
 * The user id is the only way to reach the row, so a profile update can
 * never touch another account. The email is left untouched even if the
 * caller sends one — the validator drops it.
 *
 * @param {string} userId
 * @param {import("@/lib/validation/profile").ProfileInput} input
 * @returns {Promise<import("@prisma/client").User>}
 */
export async function updateProfile(userId, input) {
  return prisma.user.update({
    where: { id: userId },
    data: { name: input.name },
    select: { ...PROFILE_SELECT },
  });
}
