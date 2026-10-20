'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { CampaignListItem, CampaignRunProgress, TextsLive } from '@/lib/texts/types'
import type { AutomationsView, TextingRules } from '@/lib/texts/view/automations'
import type { TextsUrlState } from '@/lib/texts/view/url'

export interface TextsContextValue {
  tenantId: string
  tenantSlug: string
  storeName: string
  isOwner: boolean
  isDemo: boolean
  optOutLine: string | null
  /** Absolute URL of the platform's /download page (the SmartMenu APK). */
  downloadUrl: string
  live: TextsLive
  /** True when the live read failed: the hero says "Can't check", never "Ready". */
  isLiveStale: boolean
  campaigns: CampaignListItem[]
  automations: AutomationsView
  rules: TextingRules
  url: TextsUrlState
  setUrl: (patch: Partial<TextsUrlState>) => void
  go: (href: string) => void
  /** After a write: re-read the page and the live strip. */
  refresh: () => void
}

const TextsContext = createContext<TextsContextValue | null>(null)

export function TextsProvider({ value, children }: { value: TextsContextValue; children: ReactNode }) {
  return <TextsContext.Provider value={value}>{children}</TextsContext.Provider>
}

export function useTexts(): TextsContextValue {
  const value = useContext(TextsContext)
  if (!value) throw new Error('useTexts must be used inside TextsProvider')
  return value
}

/** The server's clock from the last live read. */
export function useServerNow(): number {
  const { live } = useTexts()
  const at = Date.parse(live.sender.now)
  return Number.isFinite(at) ? at : Date.now()
}

/** A campaign's open run from the latest live read — never the page-load copy, so "Sending now" clears. */
export function useLiveProgress(campaignId: string): CampaignRunProgress | null {
  const { live } = useTexts()
  return live.progress[campaignId] ?? null
}
