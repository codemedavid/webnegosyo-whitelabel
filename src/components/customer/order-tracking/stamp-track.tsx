'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Gift } from 'lucide-react'
import type { LoyaltyEarnMode } from '@/lib/loyalty/types'

interface StampTrackProps {
  /** Stamps or points needed for one reward. */
  threshold: number
  /** How many are already collected. */
  filled: number
  earnMode: LoyaltyEarnMode
  /** Pulse the next empty slot: "this one is yours for the taking". */
  nextIsLive?: boolean
  /** Pop the last filled slot in, one at a time. */
  animateLast?: boolean
  /** The store's logo, used as the mark inside every earned slot. */
  logoUrl?: string | null
}

/** Above this many slots a row of circles stops reading; fall back to a bar. */
const MAX_SLOTS = 12

/** Rendered slot width at its largest (`max-w-11`), used to size the logo mark. */
const SLOT_PX = 44

/**
 * The loyalty card's punch row. `threshold` slots, `filled` of them stamped,
 * the last one a gift. Points programs (or very long stamp cards) get a
 * progress bar instead, since 500 tiny circles help nobody.
 */
export function StampTrack({
  threshold,
  filled,
  earnMode,
  nextIsLive = false,
  animateLast = false,
  logoUrl = null,
}: StampTrackProps) {
  const reduceMotion = useReducedMotion()
  const safeFilled = Math.max(0, Math.min(filled, threshold))

  if (earnMode === 'points' || threshold > MAX_SLOTS) {
    const percent = threshold > 0 ? Math.round((safeFilled / threshold) * 100) : 0
    return (
      <div data-testid="stamp-track" className="space-y-1.5">
        <div className="h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--trk-accent-soft)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: 'var(--trk-accent)' }}
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <p className="text-right text-xs font-semibold" style={{ color: 'var(--trk-text-muted)' }}>
          {safeFilled} / {threshold} {earnMode === 'points' ? 'points' : 'stamps'}
        </p>
      </div>
    )
  }

  const columns = threshold <= 6 ? threshold : Math.ceil(threshold / 2)

  return (
    <div
      data-testid="stamp-track"
      className="grid justify-items-center gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-label={`${safeFilled} of ${threshold} stamps`}
    >
      {Array.from({ length: threshold }, (_, index) => {
        const isFilled = index < safeFilled
        const isNext = !isFilled && index === safeFilled
        const isLast = index === threshold - 1
        const shouldPop = animateLast && isFilled && index === safeFilled - 1 && !reduceMotion

        return (
          <motion.div
            key={index}
            data-testid="stamp-slot"
            data-filled={isFilled ? 'true' : 'false'}
            initial={shouldPop ? { scale: 0, rotate: -30 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15, delay: shouldPop ? 0.35 : 0 }}
            className={`flex aspect-square w-full max-w-11 items-center justify-center rounded-full border-2 ${
              isNext && nextIsLive && !reduceMotion ? 'animate-pulse' : ''
            }`}
            style={
              isFilled
                ? logoUrl
                  ? { backgroundColor: 'var(--trk-card)', borderColor: 'var(--trk-accent)', color: 'var(--trk-accent)' }
                  : { backgroundColor: 'var(--trk-accent)', borderColor: 'var(--trk-accent)', color: 'var(--trk-on-accent)' }
                : isNext && nextIsLive
                  ? { borderColor: 'var(--trk-accent)', color: 'var(--trk-accent)', borderStyle: 'dashed', backgroundColor: 'var(--trk-accent-tint)' }
                  : { borderColor: 'var(--trk-card-border)', color: 'var(--trk-text-faint)' }
            }
          >
            {isFilled ? (
              logoUrl ? (
                <Image
                  src={logoUrl}
                  alt=""
                  aria-hidden="true"
                  width={SLOT_PX}
                  height={SLOT_PX}
                  unoptimized
                  className="h-full w-full rounded-full object-contain p-1"
                />
              ) : (
                <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
              )
            ) : isLast ? (
              <Gift className="h-4 w-4" aria-hidden="true" />
            ) : (
              <span className="text-xs font-bold">{index + 1}</span>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
