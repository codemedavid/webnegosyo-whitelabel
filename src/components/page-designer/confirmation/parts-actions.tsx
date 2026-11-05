'use client'

/**
 * The bottom of the thank-you page: Track order + Back to menu (with the
 * owner's tracking countdown when one runs), or on a kiosk the "start a new
 * order" card. Markup is today's, verbatim; the countdown line is new and
 * only shows while the owner's countdown setting is running.
 */

import { ArrowLeft, Package } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useConfirmationBlocks } from './confirmation-context'
import { CountdownText } from './countdown-text'

const PRIMARY_BUTTON =
  'w-full h-12 bg-[var(--co-button)] hover:bg-[var(--co-button)] hover:opacity-90 text-[color:var(--co-accent-text)] font-semibold rounded-full'

export interface ActionsCopy {
  track?: string
  back?: string
  countdown?: string
  stay?: string
  kioskSent?: string
  kioskFailed?: string
  kioskReturning?: string
  kioskButton?: string
}

/** Kiosk: say what is about to happen, and offer a way to skip the wait. */
export function ConfirmationKioskCard({ copy = {} }: { copy?: ActionsCopy }) {
  const b = useConfirmationBlocks()
  if (!b) return null
  return (
    <div data-branding-scope="checkout/card" className="rounded-2xl bg-[var(--co-card)] p-6 shadow-sm border border-[color:var(--co-border)]">
      <div className="space-y-4 text-center">
        <p className="text-sm font-medium text-[color:var(--co-text)]">
          {b.hasOrderSaveFailed
            ? copy.kioskFailed ?? `This order did not reach ${b.storeName}. Please tell a staff member.`
            : copy.kioskSent ?? `Your order has been sent to ${b.storeName}.`}
        </p>
        <div className="flex items-center justify-center gap-2">
          <div className="inline-flex items-center justify-center w-8 h-8 border-2 border-[color:var(--co-accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[color:var(--co-muted)]" aria-live="polite">
            <CountdownText text={copy.kioskReturning ?? 'Returning to the menu in {seconds}...'} seconds={b.kioskCountdown} />
          </p>
        </div>
        <Button size="lg" className={PRIMARY_BUTTON} onClick={b.onStartNewOrder}>
          <ArrowLeft className="mr-2 h-5 w-5" />
          {copy.kioskButton ?? 'Start a New Order'}
        </Button>
      </div>
    </div>
  )
}

/** "Opening your order tracking in 5s… · Stay on this page" — only while the owner's countdown runs. */
function TrackingCountdownLine({ copy }: { copy: ActionsCopy }) {
  const b = useConfirmationBlocks()
  if (!b || b.trackingCountdown === null) return null
  return (
    // Not a live region: the number ticks every second, and a screen reader would read each one.
    <div className="text-center space-y-1">
      <p className="text-sm text-[color:var(--co-muted)]">
        <CountdownText text={copy.countdown ?? 'Opening your order tracking in {seconds}...'} seconds={b.trackingCountdown} />
      </p>
      {b.onStayHere && (
        <button type="button" className="text-sm text-[color:var(--co-accent)] hover:underline py-1" onClick={b.onStayHere}>
          {copy.stay ?? 'Stay on this page'}
        </button>
      )}
    </div>
  )
}

/** Track Order + Back to Menu. */
export function ConfirmationTrackButtons({ copy = {}, showBack = true }: { copy?: ActionsCopy; showBack?: boolean }) {
  const b = useConfirmationBlocks()
  if (!b) return null
  return (
    <div className="pb-8 space-y-3">
      <TrackingCountdownLine copy={copy} />
      {b.canTrack && (
        <Button size="lg" className={PRIMARY_BUTTON} onClick={b.onTrack}>
          <Package className="mr-2 h-5 w-5" />
          {copy.track ?? 'Track Your Order'}
        </Button>
      )}
      {showBack && (
        <Button
          size="lg"
          variant="ghost"
          className="w-full h-12 rounded-full text-[color:var(--co-muted)] hover:bg-[var(--co-subtle)] hover:text-[color:var(--co-text)]"
          onClick={b.onBackToMenu}
        >
          <ArrowLeft className="mr-2 h-5 w-5" />
          {copy.back ?? 'Back to Menu'}
        </Button>
      )}
    </div>
  )
}
