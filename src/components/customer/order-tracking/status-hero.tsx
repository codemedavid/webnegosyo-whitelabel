'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { CalendarClock, XCircle } from 'lucide-react'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import { STATUS_STEPS } from './status-steps'
import type { PrepPromiseView as PrepPromise } from '@/lib/prep-time'

interface StatusHeroProps {
  status: string
  currentIndex: number
  customerName?: string
  placedLabel: string
  orderTypeLabel?: string
  scheduledLabel?: string | null
  prepPromise: PrepPromise | null
  /** Page Designer wording; each unset line keeps today's words (and the store's labels). */
  wording?: StatusHeroWording
  /** Page Designer layout; each unset choice keeps today's banner. */
  look?: StatusHeroLook
}

export interface StatusHeroLook {
  /** `banner` = today's big card; `compact` = a slimmer card without the decoration. */
  layout?: 'banner' | 'compact'
  isCentered?: boolean
  showGreeting?: boolean
  showPlaced?: boolean
  /** The two soft circles behind the banner. */
  showDecor?: boolean
  /** The short bar of steps under the status. */
  showProgress?: boolean
  /** The kitchen's promised ready time, when one is set. */
  showReadyTime?: boolean
}

const NO_LOOK: StatusHeroLook = {}

const SIZES = {
  banner: { section: 'p-5 shadow-lg', chip: 'h-16 w-16', icon: 'h-8 w-8', headline: 'text-2xl', bars: 'mt-5', bar: 'h-2' },
  compact: { section: 'p-4 shadow-sm', chip: 'h-12 w-12', icon: 'h-6 w-6', headline: 'text-xl', bars: 'mt-4', bar: 'h-1.5' },
} as const

export interface StatusHeroWording {
  greeting?: string
  placed?: string
  scheduled?: string
  cancelledHeadline?: string
  cancelledDetail?: string
}

const NO_WORDING: StatusHeroWording = {}

/**
 * The dashboard's headline: where the order is right now, as one big branded
 * card. The segmented bar underneath is the same five steps as the timeline,
 * compressed so the customer gets the answer before they scroll.
 *
 * Paints only from the `--trk-hero-*` variables (Branding Studio → Order
 * status → Status banner), so its style and colours are the owner's.
 */
export function StatusHero({
  status,
  currentIndex,
  customerName,
  placedLabel,
  orderTypeLabel,
  scheduledLabel,
  prepPromise,
  wording = NO_WORDING,
  look = NO_LOOK,
}: StatusHeroProps) {
  const reduceMotion = useReducedMotion()
  const isCancelled = status === 'cancelled'
  const step = STATUS_STEPS[Math.max(0, currentIndex)] ?? STATUS_STEPS[0]
  const Icon = isCancelled ? XCircle : step.icon
  const greeting = wording.greeting ?? (customerName && customerName.toLowerCase() !== 'walk-in' ? `Hi ${customerName}!` : 'Hi there!')
  const { layout = 'banner', isCentered = false, showGreeting = true, showPlaced = true, showDecor = true, showProgress = true, showReadyTime = true } = look
  const size = SIZES[layout]
  const hasMetaRow = showPlaced || Boolean(orderTypeLabel) || Boolean(scheduledLabel)

  return (
    <section
      aria-live="polite"
      data-branding-scope="tracking/hero"
      data-part="banner"
      className={`relative overflow-hidden ${size.section}`}
      style={{
        borderRadius: 'var(--trk-radius)',
        background: isCancelled ? 'var(--trk-cancelled-bg)' : 'var(--trk-hero-bg)',
        // An outline, not a border: the outlined style must not move anything.
        outline: `2px solid ${isCancelled ? 'transparent' : 'var(--trk-hero-border)'}`,
        outlineOffset: '-2px',
        color: isCancelled ? 'var(--trk-cancelled-text)' : 'var(--trk-hero-text)',
      }}
    >
      {showDecor && layout === 'banner' && (
        <>
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full" style={{ backgroundColor: 'var(--trk-hero-decor)' }} aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-12 -left-6 h-32 w-32 rounded-full" style={{ backgroundColor: 'var(--trk-hero-decor)' }} aria-hidden="true" />
        </>
      )}

      <div className={isCentered ? 'relative flex flex-col items-center gap-3 text-center' : 'relative flex items-start gap-4'}>
        <motion.div
          key={status}
          initial={reduceMotion ? false : { scale: 0.6, rotate: -15, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          data-part="icon"
          className={`flex ${size.chip} shrink-0 items-center justify-center backdrop-blur`}
          style={{ borderRadius: 'var(--trk-radius-inner)', backgroundColor: 'var(--trk-hero-chip)' }}
        >
          <Icon className={size.icon} aria-hidden="true" />
        </motion.div>
        <div className="min-w-0 flex-1">
          {showGreeting && <p data-part="text" className="text-sm font-medium opacity-85">{greeting}</p>}
          <h2 data-part="title" className={`mt-0.5 ${size.headline} font-extrabold leading-tight`}>
            {isCancelled
              ? wording.cancelledHeadline ?? <StoreLabel name="tracking.cancelled_headline" fallback="Order cancelled" />
              : <StoreLabel name={step.headlineLabel} fallback={step.headline} />}
          </h2>
          <p data-part="subtitle" className="mt-1 text-sm opacity-90">
            {isCancelled
              ? wording.cancelledDetail ?? <StoreLabel name="tracking.cancelled_detail" fallback="This order has been cancelled." />
              : <StoreLabel name={step.descriptionLabel} fallback={step.description} />}
          </p>
        </div>
      </div>

      {showProgress && !isCancelled && (
        <div className={`relative ${size.bars} flex gap-1.5`} aria-hidden="true">
          {STATUS_STEPS.map((s, index) => (
            <div
              key={s.key}
              data-part="step"
              data-on={index === currentIndex ? '' : undefined}
              data-done={index < currentIndex ? '' : undefined}
              className={`${size.bar} flex-1 overflow-hidden rounded-full`} style={{ backgroundColor: 'var(--trk-hero-track)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: 'var(--trk-hero-bar)' }}
                initial={reduceMotion ? false : { width: 0 }}
                animate={{ width: index <= currentIndex ? '100%' : '0%' }}
                transition={{ duration: 0.6, delay: reduceMotion ? 0 : index * 0.08, ease: 'easeOut' }}
              />
            </div>
          ))}
        </div>
      )}

      {showReadyTime && prepPromise && !isCancelled && (
        <div data-part="card" className="relative mt-4 px-4 py-3 backdrop-blur" style={{ borderRadius: 'var(--trk-radius-inner)', backgroundColor: 'var(--trk-hero-chip-soft)' }}>
          <p data-part="text" className="text-lg font-bold leading-tight">{prepPromise.headline}</p>
          <p data-part="muted" className="text-sm opacity-90">{prepPromise.detail}</p>
        </div>
      )}

      {hasMetaRow && (
        <div data-part="muted" className={`relative mt-4 flex flex-wrap items-center gap-2 text-xs opacity-85${isCentered ? ' justify-center' : ''}`}>
          {showPlaced && <span>{wording.placed ?? 'Placed'} {placedLabel}</span>}
          {orderTypeLabel && (
            <>
              {showPlaced && <span aria-hidden="true">·</span>}
              <span>{orderTypeLabel}</span>
            </>
          )}
          {scheduledLabel && (
            <span data-part="badge" className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold" style={{ backgroundColor: 'var(--trk-hero-chip)' }}>
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {wording.scheduled ?? 'Scheduled for'} {scheduledLabel}
            </span>
          )}
        </div>
      )}
    </section>
  )
}
