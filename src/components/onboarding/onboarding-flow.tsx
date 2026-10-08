'use client'

import { useCallback, useEffect, useState } from 'react'
import type { OnboardingView } from '@/lib/onboarding/view'
import { fetchOnboardingView } from './onboarding-api'
import { OnboardingWizard } from './onboarding-wizard'
import { OnboardingBuilding } from './onboarding-building'
import { OnboardingReveal } from './onboarding-reveal'
import { accentStyle } from './onboarding-theme'
import type { StorePreviewProps } from './store-preview-phone'

const POLL_INTERVAL_MS = 2500
/** How long to wait for the store to open after the build reports done (~20s). */
const MAX_OPENING_POLLS = 8

/**
 * True while a finished build is still opening the store: the build marks
 * itself done a moment before it flips the store live, so the page keeps
 * watching instead of showing "almost open" to an owner who is seconds away.
 */
export function isStoreOpening(view: OnboardingView): boolean {
  return view.status === 'ready'
    && !!view.store
    && !view.store.isLive
    && view.isPaymentConfirmed
    && view.launch?.canLaunch === true
}

/**
 * Wizard → live build → reveal. Polls only while something is being built or
 * the store is opening. After the wizard, the pages wear the brand color the
 * build applied.
 */
export function OnboardingFlow({ token, initialView }: { token: string; initialView: OnboardingView }) {
  const [view, setView] = useState(initialView)
  const [openingPolls, setOpeningPolls] = useState(0)
  /** What the owner saw in the wizard: the build screen shows it until the real store is painted. */
  const [submittedPreview, setSubmittedPreview] = useState<StorePreviewProps | null>(null)
  const isBuilding = view.status === 'queued' || view.status === 'running'
  const isOpening = isStoreOpening(view) && openingPolls < MAX_OPENING_POLLS
  const isPolling = isBuilding || isOpening

  const refresh = useCallback(async () => {
    const result = await fetchOnboardingView(token)
    if (result.ok) setView(result.data)
  }, [token])

  useEffect(() => {
    if (!isPolling) return
    const timer = setInterval(() => {
      if (!isBuilding) setOpeningPolls((count) => count + 1)
      void refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isPolling, isBuilding, refresh])

  // The server accepted the request, so the build is queued: show progress at
  // once and let the poll fill in the steps, even if this first read fails.
  const markQueued = useCallback(() => {
    setOpeningPolls(0)
    setView((current) => ({ ...current, status: 'queued' }))
    void refresh()
  }, [refresh])

  if (view.status === 'awaiting_details') {
    return <OnboardingWizard token={token} view={view} onSubmitted={(preview) => { setSubmittedPreview(preview); markQueued() }} />
  }

  // Mid-build the summary has no color yet: keep the one the owner just picked.
  const brand = view.summary?.brandColor ?? submittedPreview?.brand ?? view.assets.logoColor ?? null
  const showBuilding = isBuilding || isOpening || !view.store
  return (
    <div style={accentStyle(brand, '')}>
      {showBuilding
        ? <OnboardingBuilding view={view} isOpening={isOpening} preview={submittedPreview} />
        : <OnboardingReveal token={token} view={view} onRefresh={markQueuedOrRefresh(view, markQueued, refresh)} />}
    </div>
  )
}

/** A retry re-queues the build; a launch only needs a fresh read. */
function markQueuedOrRefresh(view: OnboardingView, markQueued: () => void, refresh: () => Promise<void>): () => void {
  return view.status === 'failed' ? markQueued : () => void refresh()
}
