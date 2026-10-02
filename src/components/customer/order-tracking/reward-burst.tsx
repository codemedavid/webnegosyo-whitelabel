'use client'

import { motion, useReducedMotion } from 'framer-motion'

interface RewardBurstProps {
  /** The reward's emoji, scattered among the confetti. */
  emoji?: string
}

const PARTICLES = 14
const DISTANCE_PX = 90

/**
 * A one-shot confetti pop for "your reward is ready". Decorative only: hidden
 * from assistive tech, never blocks a tap, and absent under reduced motion.
 * Place inside a `relative` container.
 */
export function RewardBurst({ emoji = '🎉' }: RewardBurstProps) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return null

  return (
    <div data-testid="reward-burst" aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible">
      {Array.from({ length: PARTICLES }, (_, index) => {
        const angle = (index / PARTICLES) * Math.PI * 2
        const distance = DISTANCE_PX * (0.6 + ((index * 7) % 5) / 10)
        const isEmoji = index % 3 === 0
        return (
          <motion.span
            key={index}
            className={isEmoji ? 'absolute text-lg' : 'absolute h-2 w-2 rounded-sm'}
            style={isEmoji ? undefined : { backgroundColor: index % 2 ? 'var(--trk-accent)' : 'var(--trk-warning)' }}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 1, rotate: 0 }}
            animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, scale: 1, opacity: 0, rotate: 180 }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 + index * 0.015 }}
          >
            {isEmoji ? emoji : null}
          </motion.span>
        )
      })}
    </div>
  )
}
