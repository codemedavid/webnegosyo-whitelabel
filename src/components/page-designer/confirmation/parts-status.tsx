'use client'

/**
 * The top of the thank-you page: the hero ("Order Placed!" or "Order Not
 * Confirmed") and, when the save failed, the notice that says what to do.
 * Markup is today's, verbatim; wording comes in as props so a designed page
 * can re-word it (the standard page passes its Branding Studio label).
 */

import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import type { OrderSaveNotice } from '@/lib/checkout/order-save-outcome'

import { useConfirmationBlocks } from './confirmation-context'

export interface FailureNoticeCopy {
  refusedHelp?: string
  messengerHelp?: string
  contactHelp?: string
}

/**
 * Shown when every attempt to save the order failed.
 *
 * The confirmation screen is optimistic: "Order Placed!" and the cleared cart
 * both land before the row is written, so a refused save leaves the customer
 * looking at a green success screen for an order the merchant will never see.
 * It renders for every design and every configuration, directly under the hero.
 *
 * The recovery it names has to be one the customer can actually perform: the
 * Messenger message when there is one (it is the merchant's remaining copy of
 * the order), and contacting the store directly when there is not.
 *
 * A REFUSAL is a different event and gets different words. The store said no on
 * purpose — below the minimum, sold out, an address with no coordinates — and
 * `notice.message` is the sentence it wrote for the customer, naming what to
 * change. Nothing is lost, so there is nothing for Messenger to rescue: telling
 * this customer to send the message would deliver the merchant an order the
 * platform just rejected.
 */
export function OrderSaveFailedNotice({
  notice,
  hasMessengerFallback,
  copy = {},
}: {
  notice: OrderSaveNotice | null
  hasMessengerFallback: boolean
  copy?: FailureNoticeCopy
}) {
  // A caller that has not been given a notice yet (an older design, a path
  // that only flipped the boolean) still gets the wording it had before.
  const headline = notice?.message ?? 'We could not confirm your order with the store.'
  const canSendMessenger = (notice?.isMessengerRecoverable ?? true) && hasMessengerFallback

  const recovery = notice?.verdict === 'refused'
    ? copy.refusedHelp ?? 'Nothing has been sent to the store. Please adjust your order and try again.'
    : canSendMessenger
      ? copy.messengerHelp ?? 'Please send the Messenger message below so they receive it.'
      : copy.contactHelp ?? 'Nothing has been sent yet — please contact the store directly to place this order.'

  return (
    <div
      role="alert"
      className="rounded-2xl border border-[color:var(--co-warning-border)] bg-[var(--co-warning-soft)] p-4 text-left"
    >
      <p className="text-sm font-semibold text-[color:var(--co-text)]">{headline}</p>
      <p className="mt-1 text-sm text-[color:var(--co-muted)]">{recovery}</p>
    </div>
  )
}

export interface HeroCopy {
  title?: ReactNode
  subtitle?: string
  failedTitle?: string
  failedSubtitle?: string
}

/**
 * The hero. A failed save must not be crowned with a green checkmark — the
 * headline is the loudest thing on this screen, and leaving it intact reads as
 * a minor hiccup rather than a lost sale.
 */
export function ConfirmationHero({ copy = {}, showIcon = true }: { copy?: HeroCopy; showIcon?: boolean }) {
  const b = useConfirmationBlocks()
  if (!b) return null
  const { hasOrderSaveFailed: isFailed, storeName } = b
  return (
    <div className="text-center py-8">
      {showIcon && (
        <div
          className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-5 ${
            isFailed ? 'bg-[var(--co-warning-soft)]' : 'bg-[var(--co-success-soft)]'
          }`}
        >
          {isFailed ? (
            <AlertTriangle className="h-14 w-14 text-[color:var(--co-warning)]" />
          ) : (
            <CheckCircle2 className="h-14 w-14 text-[color:var(--co-success)] animate-[scale-in_0.4s_ease-out]" />
          )}
        </div>
      )}
      <h1 className="text-3xl font-bold text-[color:var(--co-text)] mb-2">
        {isFailed
          ? copy.failedTitle ?? 'Order Not Confirmed'
          : copy.title ?? 'Order Placed!'}
      </h1>
      <p className="text-[color:var(--co-muted)] text-lg">
        {isFailed
          ? copy.failedSubtitle ?? `We could not reach ${storeName} with this order.`
          : copy.subtitle ?? `Your order has been sent to ${storeName}`}
      </p>
    </div>
  )
}

/** The save-failure notice from context, or nothing while the order is fine. */
export function ConfirmationFailureNotice({ copy }: { copy?: FailureNoticeCopy }) {
  const b = useConfirmationBlocks()
  if (!b?.hasOrderSaveFailed) return null
  return <OrderSaveFailedNotice notice={b.saveNotice} hasMessengerFallback={b.hasMessengerFallback} copy={copy} />
}
