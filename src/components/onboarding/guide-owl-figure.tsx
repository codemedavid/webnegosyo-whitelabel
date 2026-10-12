'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Owl, type OwlLook, type OwlState } from '@/components/mascot/owl'
import { ACCENT, ACCENT_INK } from './onboarding-ui'

interface GuideOwlProps {
  state: OwlState
  look?: OwlLook
  /** What he says when an answer is tapped ("Ayos!"); null when he has nothing to add. */
  reaction: string | null
}

/**
 * Owl above the question, which hangs from him as a speech bubble. He stays
 * put while the questions slide, so he can react. The reaction is decorative:
 * the selected card already says what was picked.
 */
export function GuideOwl({ state, look, reaction }: GuideOwlProps) {
  const isReducedMotion = useReducedMotion()
  return (
    <div className="mb-2 flex h-16 items-end gap-2">
      <Owl state={state} look={look} framing="bust" size={64} />
      <AnimatePresence>
        {reaction && (
          <motion.span
            key={reaction}
            aria-hidden
            initial={isReducedMotion ? false : { opacity: 0, scale: 0.6, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 24 }}
            className="mb-6 origin-bottom-left rounded-full px-3 py-1 text-[14px] font-extrabold"
            style={{ backgroundColor: ACCENT, color: ACCENT_INK }}
          >
            {reaction}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
