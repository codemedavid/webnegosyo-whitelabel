'use client'

import { Children, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { Owl } from '@/components/mascot/owl'
import { OB } from '../onboarding-ui'
import { CHAPTER_BREAK_MS, type ChapterBreak } from './moments'

/**
 * The set-up's motion vocabulary. Everything here moves transform/opacity
 * only, and reduced motion gets the end state at once.
 */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const
export const POP_SPRING = { type: 'spring', stiffness: 520, damping: 20 } as const

const STAGGER_S = 0.055

const LIST: Variants = { hidden: {}, shown: { transition: { staggerChildren: STAGGER_S, delayChildren: 0.06 } } }
const ITEM: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.42, ease: EASE_OUT } },
}

interface StaggerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'> {
  children: React.ReactNode
  /** Classes for each child's wrapper (e.g. h-full in a grid). */
  itemClassName?: string
}

/** A list whose children rise in one after another. Roles and keyboard handlers pass through. */
export function Stagger({ children, itemClassName, ...rest }: StaggerProps) {
  const isReducedMotion = useReducedMotion()
  return (
    <motion.div {...rest} variants={LIST} initial={isReducedMotion ? false : 'hidden'} animate="shown">
      {Children.map(children, (child) => child && <motion.div variants={ITEM} className={itemClassName}>{child}</motion.div>)}
    </motion.div>
  )
}

/** A check that draws itself, for steps that just finished. */
export function DrawCheck({ size = 16, color = 'currentColor', strokeWidth = 3.5 }: { size?: number; color?: string; strokeWidth?: number }) {
  const isReducedMotion = useReducedMotion()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <motion.path
        d="M4.5 12.5l5 5L19.5 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={isReducedMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.08 }}
      />
    </svg>
  )
}

/** A full-screen beat between chapters: the owl cheers, the next chapter is named. Tap to skip. */
export function ChapterBreakOverlay({ moment, onDone }: { moment: ChapterBreak | null; onDone: () => void }) {
  const isReducedMotion = useReducedMotion()
  useEffect(() => {
    if (!moment) return
    const timer = setTimeout(onDone, isReducedMotion ? CHAPTER_BREAK_MS / 2 : CHAPTER_BREAK_MS)
    return () => clearTimeout(timer)
  }, [moment, onDone, isReducedMotion])

  return (
    <AnimatePresence>
      {moment && (
        <motion.div
          className="fixed inset-0 z-[60] flex cursor-pointer flex-col items-center justify-center px-6 text-center"
          style={{ backgroundColor: 'var(--ob-accent-soft, #F6F4F1)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onDone}
          role="status"
          aria-live="polite"
        >
          <Owl state="celebrating" size={150} />
          <motion.p
            className="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[14px] font-bold"
            style={{ backgroundColor: 'var(--ob-accent, #17130F)', color: 'var(--ob-accent-ink, #FFFFFF)' }}
            initial={isReducedMotion ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ ...POP_SPRING, delay: 0.15 }}
          >
            <DrawCheck size={15} /> {moment.doneLabel}, done
          </motion.p>
          <motion.h2
            className="mt-4 max-w-md text-balance text-[2rem] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[2.5rem]"
            style={{ color: OB.ink }}
            initial={isReducedMotion ? false : { y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.25 }}
          >
            {moment.headline}
          </motion.h2>
          <motion.p className="mt-2 max-w-sm text-[16px] leading-relaxed" style={{ color: OB.muted }}
            initial={isReducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
            {moment.line}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** A wash of the new brand color rippling out behind the phone each time it changes. */
export function ColorRipple({ color }: { color: string }) {
  const isReducedMotion = useReducedMotion()
  const [waves, setWaves] = useState<Array<{ id: number; color: string }>>([])
  const [last, setLast] = useState(color)
  if (color !== last) {
    // Derived from the prop during render (no effect): one wave per real change.
    setLast(color)
    if (!isReducedMotion) setWaves((current) => [...current.slice(-2), { id: Date.now(), color }])
  }
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden>
      <AnimatePresence>
        {waves.map((wave) => (
          <motion.span
            key={wave.id}
            className="absolute left-1/2 top-1/2 block h-[160%] w-[160%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: wave.color }}
            initial={{ scale: 0, opacity: 0.35 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 1.1, ease: EASE_OUT }}
            onAnimationComplete={() => setWaves((current) => current.filter((item) => item.id !== wave.id))}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

/** A light sweep across the picture while it is read (menu pages, logos). */
export function ScanLine() {
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      <motion.span
        className="absolute inset-x-0 h-10"
        style={{ background: 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--ob-accent, #17130F) 35%, transparent), transparent)' }}
        initial={{ top: '-20%' }}
        animate={{ top: '110%' }}
        transition={{ duration: 1.3, ease: 'easeInOut', repeat: Infinity }}
      />
    </span>
  )
}
