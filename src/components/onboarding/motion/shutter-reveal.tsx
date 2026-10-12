'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from './parts'

/** When the shutter is fully up: the confetti waits for it. */
export const SHUTTER_OPEN_S = 1.55

const SIGN_FLIP_DELAY_S = 0.35
const ROLL_UP_DELAY_S = 0.85

/**
 * Opening day: a sari-sari store's roll-up shutter over the store's banner.
 * The sign on it flips from SARADO to BUKAS NA!, then the shutter rolls up.
 * Plays once, only when the store is really open; reduced motion shows the open banner.
 */
export function ShutterReveal({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  const isReducedMotion = useReducedMotion()
  const isPlaying = isOpen && !isReducedMotion
  return (
    <div className="relative overflow-hidden rounded-3xl">
      {children}
      {isPlaying && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: '#8E8780', backgroundImage: 'repeating-linear-gradient(180deg, #9C958E 0 6px, #7E7770 6px 8px, #A8A19A 8px 12px)' }}
          initial={{ y: 0 }}
          animate={{ y: '-102%' }}
          transition={{ delay: ROLL_UP_DELAY_S, duration: SHUTTER_OPEN_S - ROLL_UP_DELAY_S, ease: EASE_OUT }}
          aria-hidden
        >
          <span className="absolute inset-x-0 bottom-0 h-2.5 bg-[#5E5852]" />
          <span className="[perspective:500px]">
            <motion.span
              className="relative block h-11 w-36 [transform-style:preserve-3d]"
              initial={{ rotateY: 0 }}
              animate={{ rotateY: 180 }}
              transition={{ delay: SIGN_FLIP_DELAY_S, duration: 0.45, ease: 'easeInOut' }}
            >
              <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-[#B42318] text-[17px] font-black tracking-[0.14em] text-white shadow-md [backface-visibility:hidden]">SARADO</span>
              <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-emerald-600 text-[16px] font-black tracking-[0.08em] text-white shadow-md [backface-visibility:hidden] [transform:rotateY(180deg)]">BUKAS NA!</span>
            </motion.span>
          </span>
        </motion.div>
      )}
    </div>
  )
}
