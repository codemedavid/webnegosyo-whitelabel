'use client'

import { MotionConfig } from 'framer-motion'

/** Every set-up page honours the device's reduced-motion setting: Framer then skips transforms and keeps fades. */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
