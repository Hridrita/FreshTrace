/**
 * Account view helpers.
 *
 * The account page and its addresses sub-page both show the customer's saved
 * addresses, so the shape they are rendered in is defined once here rather
 * than duplicated in each page.
 */

/**
 * @typedef {object} AddressView
 * @property {string} id
 * @property {string} label
 * @property {string} line1
 * @property {string | null} line2
 * @property {string} area
 * @property {string} city
 * @property {string | null} deliveryNotes
 * @property {boolean} isDefault
 */

/**
 * Shape a customer's addresses for the view.
 *
 * The Prisma rows carry more than the view needs — `userId`, the geo
 * coordinates and the timestamps — and the geo fields are not part of the
 * form, so only the fields the customer actually sees are passed down.
 *
 * @param {Array<import("@prisma/client").Address>} addresses
 * @returns {AddressView[]}
 */
export function toAddressViews(addresses) {
  return addresses.map((address) => ({
    id: address.id,
    label: address.label,
    line1: address.line1,
    line2: address.line2,
    area: address.area,
    city: address.city,
    deliveryNotes: address.deliveryNotes,
    isDefault: address.isDefault,
  }));
}
