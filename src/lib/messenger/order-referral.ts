/**
 * Whether a Messenger sender may be told about an order through an `ORDER_<id>`
 * referral.
 *
 * The ref is unsigned and built in the customer's browser, and the id is also in
 * the tracking link, so anyone holding that link could otherwise read the guest's
 * name, phone and address and take over later messages for the order. Two limits:
 * the first conversation to claim an order keeps it, and the link only works while
 * the order is fresh. Messenger's own reply window is 24 hours.
 *
 * Not a full proof of ownership: the first claimant inside the window still wins.
 * Signing the ref at checkout closes that and needs the save path to hand it out.
 */

export const ORDER_REFERRAL_WINDOW_MS = 24 * 60 * 60 * 1000

export function mayAnswerOrderReferral(input: {
  senderId: string
  customerData: unknown
  createdAt: string | undefined
  now: number
}): boolean {
  const createdAt = input.createdAt ? new Date(input.createdAt).getTime() : Number.NaN
  if (!Number.isFinite(createdAt) || input.now - createdAt > ORDER_REFERRAL_WINDOW_MS) return false

  const data = (input.customerData ?? {}) as { messenger_psid?: unknown; messenger_sender_id?: unknown }
  const owner = data.messenger_psid ?? data.messenger_sender_id
  return !owner || owner === input.senderId
}
