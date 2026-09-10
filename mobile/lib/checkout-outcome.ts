/**
 * What actually happened to a checkout, and what the customer may be told.
 *
 * The screens used to infer this from `orderId == null`, which cannot tell a
 * saved order from a refused one from a tenant that stores no order at all —
 * so every customer got "Order Placed!" and an auto-sent Messenger message,
 * including the ones whose order the platform had just rejected.
 *
 * Four outcomes, never inferred:
 *  - `saved`       the row exists;
 *  - `not-tracked` no row was meant to exist (a Messenger-only tenant has
 *                  neither convex_deployment_url nor enable_order_management).
 *                  This is a SUCCESS — treating it as a failure would show a
 *                  false error to every one of those merchants' customers;
 *  - `refused`     the store deliberately said no. Sending the Messenger
 *                  message would hand the merchant an order the platform
 *                  rejected, so that channel is closed;
 *  - `failed`      something broke. The Messenger message is the merchant's
 *                  only remaining copy of the order, so it stays open.
 */

export type OrderSaveStatus = 'saved' | 'not-tracked' | 'refused' | 'failed'

export interface OrderSaveOutcome {
  status: OrderSaveStatus
  /** Present whenever a row exists — including a `failed` order whose lines did not save. */
  orderId: string | null
  /** A sentence fit to show the customer; null when nothing specific is known. */
  message: string | null
  /** Raw text for the log. Never rendered — it names tables and policies. */
  detail: string | null
}

/** Postgres `insufficient_privilege`: a row-level policy refused the write. */
export const RLS_REFUSAL_CODE = '42501'

const STORE_REFUSED_MESSAGE =
  'This store is not accepting orders through the app right now, so nothing was placed.'

const LINES_LOST_MESSAGE =
  'Your order was created but its items did not save. Send the order message so the store gets the full list.'

export interface PostgrestErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

/** Convex's HTTP mutation envelope: `{ status: 'success', value }` or `{ status: 'error', errorMessage }`. */
export interface ConvexMutationResponseLike {
  status?: string | null
  value?: unknown
  errorMessage?: string | null
}

export function savedOrder(orderId: string): OrderSaveOutcome {
  return { status: 'saved', orderId, message: null, detail: null }
}

export function untrackedOrder(): OrderSaveOutcome {
  return { status: 'not-tracked', orderId: null, message: null, detail: null }
}

export function isOrderRecorded(status: OrderSaveStatus): boolean {
  return status === 'saved' || status === 'not-tracked'
}

const describeError = (error: unknown): string => {
  if (!error) return 'no error detail'
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  const like = error as PostgrestErrorLike
  const parts = [like.code, like.message, like.details].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : JSON.stringify(error)
}

const isRlsRefusal = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  return (error as PostgrestErrorLike).code === RLS_REFUSAL_CODE
}

/**
 * Classifies a refused `orders` insert.
 *
 * 42501 is the store saying no: the anon policy requires, among other things,
 * `tenants.is_active = true`, so a deactivated merchant lands here for every
 * order. Anything else is treated as transient — guessing a refusal out of an
 * arbitrary error string would close the Messenger channel on orders that are
 * merely unlucky.
 */
export function classifyOrderWriteError(error: unknown): OrderSaveOutcome {
  const detail = describeError(error)

  if (isRlsRefusal(error)) {
    return { status: 'refused', orderId: null, message: STORE_REFUSED_MESSAGE, detail }
  }

  return { status: 'failed', orderId: null, message: null, detail }
}

/**
 * Classifies a refused `order_items` insert.
 *
 * Never a refusal, even on 42501: the parent `orders` row is already committed,
 * so the store DID take the order, and withholding the Messenger message would
 * leave the merchant holding a live pending order with a total and no lines.
 */
export function classifyOrderLinesWriteError(orderId: string, error: unknown): OrderSaveOutcome {
  return {
    status: 'failed',
    orderId,
    message: LINES_LOST_MESSAGE,
    detail: describeError(error),
  }
}

/**
 * Classifies a Convex `orders:createOrder` response.
 *
 * `errorMessage` is carried through untouched — the deployment writes the one
 * sentence that tells the customer what to do about it (a sold-out item, a
 * closed presell date), and the screen used to discard it.
 *
 * Everything short of a success with an id is `failed`, never `refused`: the
 * deployment has no policy layer to refuse against, and picking a refusal out
 * of an error string is guesswork.
 */
export function classifyConvexOrderResponse(
  isHttpOk: boolean,
  httpStatus: number,
  body: ConvexMutationResponseLike | null | undefined
): OrderSaveOutcome {
  if (!isHttpOk) {
    return {
      status: 'failed',
      orderId: null,
      message: null,
      detail: `Convex mutation returned HTTP ${httpStatus}`,
    }
  }

  if (body?.status === 'success') {
    const orderId = typeof body.value === 'string' ? body.value.trim() : ''
    if (orderId) return savedOrder(orderId)

    return {
      status: 'failed',
      orderId: null,
      message: null,
      detail: 'Convex mutation succeeded without returning an order id',
    }
  }

  const errorMessage = body?.errorMessage?.trim() || null
  return {
    status: 'failed',
    orderId: null,
    message: errorMessage,
    detail: errorMessage ?? `Convex mutation returned ${body?.status ?? 'no status'}`,
  }
}

export interface OrderOutcomeCopy {
  tone: 'success' | 'warning'
  iconName: 'checkmark-circle' | 'alert-circle'
  title: string
  subtitle: string
  footerNote: string
  /**
   * Whether the Messenger message can still deliver this order to the store.
   * Gates both the buttons and the auto-open — false only on a refusal.
   */
  canMessengerDeliver: boolean
}

const SUCCESS_FOOTER =
  'If Messenger did not open, use the buttons above to open it manually or copy your order message.'

/** The confirmation header, derived from the outcome — never hardcoded. */
export function describeOrderOutcome(
  status: OrderSaveStatus,
  storeName: string
): OrderOutcomeCopy {
  if (isOrderRecorded(status)) {
    return {
      tone: 'success',
      iconName: 'checkmark-circle',
      title: 'Order Placed!',
      subtitle: `Your order has been sent to ${storeName}`,
      footerNote: SUCCESS_FOOTER,
      canMessengerDeliver: true,
    }
  }

  if (status === 'refused') {
    return {
      tone: 'warning',
      iconName: 'alert-circle',
      title: 'Order Not Accepted',
      subtitle: `${storeName} is not taking orders through the app right now, so nothing was placed. Please contact them directly before trying again.`,
      footerNote: 'Nothing was ordered and nothing was charged.',
      canMessengerDeliver: false,
    }
  }

  return {
    tone: 'warning',
    iconName: 'alert-circle',
    title: 'Order Not Saved',
    subtitle: `We could not record your order with ${storeName}. Send the order message on Messenger and they will still receive it.`,
    footerNote: `Your order only reaches ${storeName} once that message is sent.`,
    canMessengerDeliver: true,
  }
}
