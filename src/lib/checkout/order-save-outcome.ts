/**
 * What to tell the customer when the optimistic confirmation screen was wrong.
 *
 * `createOrderAction` answers a failed checkout in two very different voices,
 * and the checkout used to hear only one of them:
 *
 *  - A REFUSAL is the store saying no on purpose — below the order minimum, a
 *    dish that just sold out, a delivery address with no coordinates. The
 *    sentence it returns is written for a diner and names what to change.
 *    Handing that customer the Messenger message would deliver the merchant an
 *    order the platform deliberately rejected.
 *  - A FAILURE is the order genuinely going missing — a network drop, an RLS
 *    refusal, a thrown backend error. Its message is internal, and here the
 *    Messenger message really is the merchant's last copy of the order.
 *
 * Both used to collapse into one hardcoded sentence that gave the wrong advice
 * for the first case and threw away an actionable sentence for it. This module
 * is the whole decision, kept pure so it can be tested without rendering a
 * 1,600-line hook.
 */

/** Shown when the save failed and the order may never have reached the store. */
export const GENERIC_SAVE_FAILURE_MESSAGE =
  'We could not confirm your order with the store.'

/**
 * Shown when the store refused but named no reason. Rare — every refusal in
 * `createOrderAction` carries a sentence — but a backend that returns a bare
 * `refused` must still say something a customer can read.
 */
export const GENERIC_REFUSAL_MESSAGE =
  'The store could not accept this order.'

export type OrderSaveVerdict = 'saved' | 'refused' | 'failed'

/** The shape `createOrderAction` answers with, narrowed to what matters here. */
export interface OrderSaveReply {
  success?: boolean
  /**
   * Set by the server ONLY for a deterministic refusal. Absent means "this
   * backend has not been taught the difference", which reads as a failure —
   * the same fail-closed choice `isOrderSaveRetrySafe` makes, and for the same
   * reason: mistaking a lost order for a refusal withholds the Messenger
   * message that still delivers it.
   */
  refused?: boolean
  error?: string
}

export interface OrderSaveNotice {
  verdict: OrderSaveVerdict
  /** What the customer reads. Empty when the order saved. */
  message: string
  /** Whether sending the Messenger message still gets this order to the store. */
  isMessengerRecoverable: boolean
}

const SAVED: OrderSaveNotice = {
  verdict: 'saved',
  message: '',
  isMessengerRecoverable: false,
}

const FAILED: OrderSaveNotice = {
  verdict: 'failed',
  message: GENERIC_SAVE_FAILURE_MESSAGE,
  isMessengerRecoverable: true,
}

const cleanReason = (error: string | undefined): string => (error ?? '').trim()

export function classifyOrderSave(
  reply: OrderSaveReply | null | undefined
): OrderSaveNotice {
  if (reply?.success === true) return SAVED

  // Only an explicit `true` counts. Anything else — undefined, a truthy
  // string, an older backend — stays a failure.
  if (reply?.refused !== true) return FAILED

  const reason = cleanReason(reply.error)

  return {
    verdict: 'refused',
    message: reason === '' ? GENERIC_REFUSAL_MESSAGE : reason,
    isMessengerRecoverable: false,
  }
}
