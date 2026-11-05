'use client'

/**
 * Everything the tracking page's blocks paint from, in one value: the order,
 * its clock lines, the alarm, the loyalty and pickup slots, the way back.
 * TrackingDashboard builds it from the same props the standard page uses, so
 * the live page (order-tracking-client) and the Branding Studio's sample
 * (tracking-studio-preview) feed a designed page exactly like the standard one.
 * The Page Designer editor's samples provide a sample value instead.
 */

import { createContext, useContext, type ReactNode } from 'react'
import type { TrackingData } from '@/lib/order-tracking-service'
import type { PrepPromiseView } from '@/lib/prep-time'
import type { BrandingColors } from '@/lib/branding-utils'
import type { TrackingStyle } from '@/lib/tracking-style/keys'

/** What the page's `--trk-*` variables were built from, so a block can re-resolve them with its own colours. */
export interface TrackingPaint {
  branding: BrandingColors
  style: TrackingStyle
}

export interface TrackingBlocksValue {
  storeName: string
  logoUrl: string | null
  data: TrackingData
  /** "07" — the daily number (or the id's tail) without the "#". */
  shortId: string
  currentIndex: number
  placedLabel: string
  prepPromise: PrepPromiseView | null
  isAlarmArmed: boolean
  onArmAlarm: () => void
  /** The loyalty card with any notice above it, or nothing. */
  loyalty: ReactNode
  /** The pickup QR, or nothing. */
  pickup: ReactNode
  onBack: () => void
  /** The store's branding + tracking look; absent = blocks keep the page's colours (their designs still apply). */
  paint?: TrackingPaint
}

const TrackingBlocksContext = createContext<TrackingBlocksValue | null>(null)

export function TrackingBlocksProvider({ value, children }: { value: TrackingBlocksValue; children: ReactNode }) {
  return <TrackingBlocksContext.Provider value={value}>{children}</TrackingBlocksContext.Provider>
}

/** The page's live values; null outside a tracking page (the block renders nothing). */
export function useTrackingBlocks(): TrackingBlocksValue | null {
  return useContext(TrackingBlocksContext)
}
