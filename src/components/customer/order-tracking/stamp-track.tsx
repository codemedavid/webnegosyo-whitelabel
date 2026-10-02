'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cardSteps } from '@/lib/loyalty/card-progress'
import type { LoyaltyRewardStep } from '@/lib/loyalty/ladder'
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
  /** Every reward on the card; absent = one reward on the last slot. */
  steps?: LoyaltyRewardStep[]
}

/** Above this many slots a row of circles stops reading; fall back to a bar. */
const MAX_SLOTS = 12

/** Rendered slot width at its largest (`max-w-11`), used to size the logo mark. */
const SLOT_PX = 44

const BOUNCE = { y: [0, -5, 0] }
const BOUNCE_TRANSITION = { duration: 1.4, repeat: Infinity, ease: 'easeInOut' as const }

/** The reward's own face: its menu photo, or its emoji. */
export function RewardIcon({ step, size }: { step: LoyaltyRewardStep; size: number }) {
  if (step.imageUrl) {
    return (
      <Image
        src={step.imageUrl}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        unoptimized
        className="h-full w-full rounded-full object-cover"
      />
    )
  }
  return (
    <span aria-hidden="true" className="leading-none" style={{ fontSize: size * 0.5 }}>
      {step.emoji}
    </span>
  )
}

/**
 * The loyalty card's punch row. `threshold` slots, `filled` of them stamped,
 * and every reward drawn ON its slot — the free drink at 5 is a picture of the
 * drink, so the customer sees what they are collecting toward. Points programs
 * (or very long stamp cards) get a progress bar with reward bubbles along it.
 */
export function StampTrack({
  threshold,
  filled,
  earnMode,
  nextIsLive = false,
  animateLast = false,
  logoUrl = null,
  steps,
}: StampTrackProps) {
  const reduceMotion = useReducedMotion()
  const safeFilled = Math.max(0, Math.min(filled, threshold))
  const ladder = cardSteps(steps, threshold, 'Reward')
  const nextStep = ladder.find((step) => step.at > safeFilled) ?? null

  if (earnMode === 'points' || threshold > MAX_SLOTS) {
    const percent = threshold > 0 ? Math.round((safeFilled / threshold) * 100) : 0
    return (
      <div data-testid="stamp-track" className="space-y-1.5" aria-label={`${safeFilled} of ${threshold} ${earnMode === 'points' ? 'points' : 'stamps'}`}>
        <div className="relative pt-9">
          {ladder.map((step) => {
            const isReached = safeFilled >= step.at
            const isNext = step === nextStep
            return (
              <motion.div
                key={step.at}
                data-testid="reward-marker"
                data-reached={isReached ? 'true' : 'false'}
                className="absolute top-0 flex h-8 w-8 -translate-x-1/2 items-center justify-center overflow-hidden rounded-full border-2"
                style={{
                  left: `${Math.min(100, (step.at / threshold) * 100)}%`,
                  borderColor: 'var(--trk-accent)',
                  backgroundColor: isReached ? 'var(--trk-accent)' : 'var(--trk-card)',
                  boxShadow: isReached ? '0 0 0 4px var(--trk-accent-soft)' : undefined,
                }}
                animate={isNext && nextIsLive && !reduceMotion ? BOUNCE : undefined}
                transition={BOUNCE_TRANSITION}
                title={`${step.label} at ${step.at}`}
              >
                <RewardIcon step={step} size={32} />
              </motion.div>
            )
          })}
          <div className="h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--trk-accent-soft)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: 'var(--trk-accent)' }}
              initial={reduceMotion ? false : { width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>
        <p className="text-right text-xs font-semibold" style={{ color: 'var(--trk-text-muted)' }}>
          {safeFilled} / {threshold} {earnMode === 'points' ? 'points' : 'stamps'}
        </p>
      </div>
    )
  }

  const columns = threshold <= 6 ? threshold : Math.ceil(threshold / 2)
  const stepAt = new Map(ladder.map((step) => [step.at, step]))

  return (
    <div
      data-testid="stamp-track"
      className="grid justify-items-center gap-2 pt-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-label={`${safeFilled} of ${threshold} stamps`}
    >
      {Array.from({ length: threshold }, (_, index) => {
        const slot = index + 1
        const isFilled = index < safeFilled
        const isNext = !isFilled && index === safeFilled
        const shouldPop = animateLast && isFilled && index === safeFilled - 1 && !reduceMotion
        const step = stepAt.get(slot)

        if (step) {
          const isNextReward = step === nextStep && nextIsLive && !reduceMotion
          return (
            <motion.div
              key={index}
              data-testid="stamp-slot"
              data-filled={isFilled ? 'true' : 'false'}
              data-reward={step.label}
              className="relative flex aspect-square w-full max-w-11 items-center justify-center rounded-full border-2"
              style={
                isFilled
                  ? { backgroundColor: 'var(--trk-accent)', borderColor: 'var(--trk-accent)', boxShadow: '0 0 0 4px var(--trk-accent-soft)' }
                  : { borderColor: 'var(--trk-accent)', borderStyle: 'dashed', backgroundColor: 'var(--trk-accent-tint)' }
              }
              initial={shouldPop ? { scale: 0, rotate: -30 } : false}
              animate={isNextReward ? { ...BOUNCE, scale: 1, rotate: 0 } : { scale: 1, rotate: 0 }}
              transition={isNextReward ? BOUNCE_TRANSITION : { type: 'spring', stiffness: 300, damping: 15, delay: shouldPop ? 0.35 : 0 }}
              title={step.label}
            >
              <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
                <RewardIcon step={step} size={SLOT_PX} />
              </span>
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                style={{ backgroundColor: isFilled ? 'var(--trk-success)' : 'var(--trk-accent)', color: 'var(--trk-on-accent)' }}
              >
                {isFilled ? <Check className="h-2.5 w-2.5" strokeWidth={4} /> : slot}
              </span>
            </motion.div>
          )
        }

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
            ) : (
              <span className="text-xs font-bold">{slot}</span>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
