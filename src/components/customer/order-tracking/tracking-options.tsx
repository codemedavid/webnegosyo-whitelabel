'use client'

/**
 * The owner's non-colour choices for the order page and loyalty card (show the
 * timeline, where the card sits, confetti, what an earned stamp shows). The
 * colours travel as `--trk-*` variables; these need React, so they travel here.
 * Without a provider every choice is today's default.
 */

import { createContext, useContext, type ReactNode } from 'react'
import { DEFAULT_TRACKING_OPTIONS, type TrackingOptions } from '@/lib/tracking-style/keys'

const TrackingOptionsContext = createContext<TrackingOptions>(DEFAULT_TRACKING_OPTIONS)

export function TrackingOptionsProvider({ options, children }: { options: TrackingOptions; children: ReactNode }) {
  return <TrackingOptionsContext.Provider value={options}>{children}</TrackingOptionsContext.Provider>
}

export function useTrackingOptions(): TrackingOptions {
  return useContext(TrackingOptionsContext)
}
