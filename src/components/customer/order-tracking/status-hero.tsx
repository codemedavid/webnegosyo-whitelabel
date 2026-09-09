'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { CalendarClock, XCircle } from 'lucide-react'
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
      className="relative overflow-hidden rounded-3xl p-5 shadow-lg"
      style={{
        background: isCancelled
          ? 'linear-gradient(135deg, var(--trk-error), color-mix(in srgb, var(--trk-error) 70%, black))'
          : 'linear-gradient(135deg, var(--trk-accent), var(--trk-accent-strong))',
        color: 'var(--trk-on-accent)',
      }}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-white/10" aria-hidden="true" />

      <div className="relative flex items-start gap-4">
        <motion.div
          key={status}
          initial={reduceMotion ? false : { scale: 0.6, rotate: -15, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur"
        >
          <Icon className="h-8 w-8" aria-hidden="true" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium opacity-85">{greeting}</p>
          <h2 className="mt-0.5 text-2xl font-extrabold leading-tight">
            {isCancelled ? 'Order cancelled' : step.headline}
          </h2>
          <p className="mt-1 text-sm opacity-90">
            {isCancelled ? 'This order has been cancelled.' : step.description}
          </p>
        </div>
      </div>

      {!isCancelled && (
        <div className="relative mt-5 flex gap-1.5" aria-hidden="true">
          {STATUS_STEPS.map((s, index) => (
            <div key={s.key} className="h-2 flex-1 overflow-hidden rounded-full bg-white/25">
              <motion.div
                className="h-full rounded-full bg-white"
                initial={reduceMotion ? false : { width: 0 }}
                animate={{ width: index <= currentIndex ? '100%' : '0%' }}
                transition={{ duration: 0.6, delay: reduceMotion ? 0 : index * 0.08, ease: 'easeOut' }}
              />
            </div>
          ))}
        </div>
      )}

      {prepPromise && !isCancelled && (
        <div className="relative mt-4 rounded-2xl bg-white/15 px-4 py-3 backdrop-blur">
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
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 font-semibold">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Scheduled for {scheduledLabel}
          </span>
        )}
      </div>
    </section>
  )
}
