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

const PRIMARY_BASE =
  'w-full h-12 bg-[var(--co-button)] hover:bg-[var(--co-button)] hover:opacity-90 text-[color:var(--co-accent-text)] font-semibold'
/** Today's button corners; a designed page may pass another shape. */
const PILL = 'rounded-full'

const primaryButton = (shape: string): string => `${PRIMARY_BASE} ${shape}`

/** Page Designer layouts of Track + Back; `stacked` is today's. */
export type ActionsLayout = 'stacked' | 'side' | 'outline'

const BACK_BUTTON: Record<ActionsLayout, { variant: 'ghost' | 'outline'; className: (shape: string) => string }> = {
  stacked: {
    variant: 'ghost',
    className: (shape) => `w-full h-12 ${shape} text-[color:var(--co-muted)] hover:bg-[var(--co-subtle)] hover:text-[color:var(--co-text)]`,
  },
  side: {
    variant: 'ghost',
    className: (shape) => `w-full h-auto min-h-12 whitespace-normal ${shape} text-[color:var(--co-muted)] hover:bg-[var(--co-subtle)] hover:text-[color:var(--co-text)]`,
  },
  outline: {
    variant: 'outline',
    className: (shape) => `w-full h-12 ${shape} border-2 border-[color:var(--co-button)] bg-transparent font-semibold text-[color:var(--co-text)] hover:bg-[var(--co-subtle)] hover:text-[color:var(--co-text)]`,
  },
}

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
export function ConfirmationKioskCard({ copy = {}, shape = PILL }: { copy?: ActionsCopy; shape?: string }) {
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
        <Button size="lg" className={primaryButton(shape)} onClick={b.onStartNewOrder}>
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

interface TrackButtonsProps {
  copy?: ActionsCopy
  showBack?: boolean
  /** Page Designer only; the defaults are today's buttons. */
  layout?: ActionsLayout
  shape?: string
}

/** Track Order + Back to Menu. */
export function ConfirmationTrackButtons({ copy = {}, showBack = true, layout = 'stacked', shape = PILL }: TrackButtonsProps) {
  const b = useConfirmationBlocks()
  if (!b) return null
  const isSide = layout === 'side'
  const back = BACK_BUTTON[layout]
  const buttons = (
    <>
      {b.canTrack && (
        <Button size="lg" className={isSide ? `${primaryButton(shape)} h-auto min-h-12 whitespace-normal` : primaryButton(shape)} onClick={b.onTrack}>
          <Package className="mr-2 h-5 w-5" />
          {copy.track ?? 'Track Your Order'}
        </Button>
      )}
      {showBack && (
        <Button
          size="lg"
          variant={back.variant}
          className={back.className(shape)}
          onClick={b.onBackToMenu}
        >
          <ArrowLeft className="mr-2 h-5 w-5" />
          {copy.back ?? 'Back to Menu'}
        </Button>
      )}
    </>
  )
  return (
    <div className="pb-8 space-y-3">
      <TrackingCountdownLine copy={copy} />
      {isSide ? (
        <div className={`grid gap-3 ${b.canTrack && showBack ? 'grid-cols-2' : 'grid-cols-1'}`}>{buttons}</div>
      ) : buttons}
    </div>
  )
}
