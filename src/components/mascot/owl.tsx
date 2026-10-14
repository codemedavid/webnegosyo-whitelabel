'use client'

import { useId, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { OWL_VIEWBOX } from './owl-art.generated'
import { owlMarkup, type OwlState } from './owl-markup'
import styles from './owl.module.css'

export { OWL_STATES, type OwlState } from './owl-markup'

/** Whole owl, or head and shoulders in a square (avatars, the assistant button). */
const FRAMES = {
  full: { viewBox: OWL_VIEWBOX, width: 690, height: 915 },
  bust: { viewBox: '75 20 540 540', width: 540, height: 540 },
} as const

type OwlFraming = keyof typeof FRAMES

/** Below this width the blur shading is invisible but still costs paint time. */
const LITE_BELOW_PX = 120

interface OwlProps {
  state?: OwlState
  /** Rendered width in px; the height follows the framing. */
  size?: number
  framing?: OwlFraming
  /** Accessible name. Without one the owl is decorative (aria-hidden). */
  label?: string
  className?: string
}

/**
 * Owl, the SmartMenu mascot, animated by state (see owl.module.css).
 * Merchant-facing surfaces only: storefronts are white-labeled as the store's own brand.
 */
export function Owl({ state = 'idle', size = 160, framing = 'full', label, className }: OwlProps) {
  const prefix = `owl${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const isLite = size < LITE_BELOW_PX
  const markup = useMemo(() => owlMarkup({ prefix, isLite }), [prefix, isLite])
  const frame = FRAMES[framing]

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={frame.viewBox}
      width={size}
      height={Math.round((size * frame.height) / frame.width)}
      data-state={state}
      className={cn(styles.owl, className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      // Static art generated at build time by scripts/mascot/build-owl-svg.mjs;
      // no user input ever reaches this string.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
