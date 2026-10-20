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
}

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
}: StatusHeroProps) {
  const reduceMotion = useReducedMotion()
  const isCancelled = status === 'cancelled'
  const step = STATUS_STEPS[Math.max(0, currentIndex)] ?? STATUS_STEPS[0]
  const Icon = isCancelled ? XCircle : step.icon
  const greeting = customerName && customerName.toLowerCase() !== 'walk-in' ? `Hi ${customerName}!` : 'Hi there!'

  return (
    <section
      aria-live="polite"
      data-branding-scope="tracking/hero"
      className="relative overflow-hidden p-5 shadow-lg"
      style={{
        borderRadius: 'var(--trk-radius)',
        background: isCancelled ? 'var(--trk-cancelled-bg)' : 'var(--trk-hero-bg)',
        // An outline, not a border: the outlined style must not move anything.
        outline: `2px solid ${isCancelled ? 'transparent' : 'var(--trk-hero-border)'}`,
        outlineOffset: '-2px',
        color: isCancelled ? 'var(--trk-cancelled-text)' : 'var(--trk-hero-text)',
      }}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full" style={{ backgroundColor: 'var(--trk-hero-decor)' }} aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-12 -left-6 h-32 w-32 rounded-full" style={{ backgroundColor: 'var(--trk-hero-decor)' }} aria-hidden="true" />

      <div className="relative flex items-start gap-4">
        <motion.div
          key={status}
          initial={reduceMotion ? false : { scale: 0.6, rotate: -15, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="flex h-16 w-16 shrink-0 items-center justify-center backdrop-blur"
          style={{ borderRadius: 'var(--trk-radius-inner)', backgroundColor: 'var(--trk-hero-chip)' }}
        >
          <Icon className="h-8 w-8" aria-hidden="true" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium opacity-85">{greeting}</p>
          <h2 className="mt-0.5 text-2xl font-extrabold leading-tight">
            {isCancelled
              ? <StoreLabel name="tracking.cancelled_headline" fallback="Order cancelled" />
              : <StoreLabel name={step.headlineLabel} fallback={step.headline} />}
          </h2>
          <p className="mt-1 text-sm opacity-90">
            {isCancelled
              ? <StoreLabel name="tracking.cancelled_detail" fallback="This order has been cancelled." />
              : <StoreLabel name={step.descriptionLabel} fallback={step.description} />}
          </p>
        </div>
      </div>

      {!isCancelled && (
        <div className="relative mt-5 flex gap-1.5" aria-hidden="true">
          {STATUS_STEPS.map((s, index) => (
            <div key={s.key} className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--trk-hero-track)' }}>
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

      {prepPromise && !isCancelled && (
        <div className="relative mt-4 px-4 py-3 backdrop-blur" style={{ borderRadius: 'var(--trk-radius-inner)', backgroundColor: 'var(--trk-hero-chip-soft)' }}>
          <p className="text-lg font-bold leading-tight">{prepPromise.headline}</p>
          <p className="text-sm opacity-90">{prepPromise.detail}</p>
        </div>
      )}

      <div className="relative mt-4 flex flex-wrap items-center gap-2 text-xs opacity-85">
        <span>Placed {placedLabel}</span>
        {orderTypeLabel && (
          <>
            <span aria-hidden="true">·</span>
            <span>{orderTypeLabel}</span>
          </>
        )}
        {scheduledLabel && (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold" style={{ backgroundColor: 'var(--trk-hero-chip)' }}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Scheduled for {scheduledLabel}
          </span>
        )}
      </div>
    </section>
  )
}
