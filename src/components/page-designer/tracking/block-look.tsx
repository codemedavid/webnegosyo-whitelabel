'use client'

/**
 * One tracking block painted with its own look: the block's colour knobs and
 * store-wide choices it stands in for (corners, banner style, stamp shape…)
 * re-resolve the page's `--trk-*` variables for this block only, and the
 * choices React reads (what an earned stamp shows) travel in a nested
 * TrackingOptionsProvider. A block that changes nothing renders its children
 * as they are, so the page's own look applies exactly as before.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react'

import { TrackingOptionsProvider, useTrackingOptions } from '@/components/customer/order-tracking/tracking-options'
import { blockTrackingVars, type TrackingBlockLook } from '@/lib/page-designer/tracking-colors'
import { useTrackingBlocks } from './tracking-blocks-context'

interface BlockLookProps {
  look: TrackingBlockLook
  /** Extra variables this design sets for its block (e.g. a plain pickup code clears its card). */
  vars?: CSSProperties
  /** Classes on the wrapper (it is `display: contents`, so only descendant selectors apply). */
  className?: string
  children: ReactNode
}

/** True when a look sets a choice that React (not CSS) reads. */
const hasReactChoice = (look: TrackingBlockLook) => look.options.stamp_fill !== undefined

export function BlockLook({ look, vars, className, children }: BlockLookProps) {
  const blocks = useTrackingBlocks()
  const paint = blocks?.paint
  const pageOptions = useTrackingOptions()
  const themed = useMemo(() => (paint ? blockTrackingVars(paint.branding, paint.style, look) : null), [paint, look])
  const options = useMemo(() => (hasReactChoice(look) ? { ...pageOptions, ...look.options } : null), [pageOptions, look])

  const style = themed || vars ? ({ display: 'contents', ...themed, ...vars } as CSSProperties) : null
  const painted = style || className ? (
    <div data-block-look="" className={className} style={style ?? { display: 'contents' }}>
      {children}
    </div>
  ) : (
    <>{children}</>
  )
  return options ? <TrackingOptionsProvider options={options}>{painted}</TrackingOptionsProvider> : painted
}
