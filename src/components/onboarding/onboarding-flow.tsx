'use client'

import { useCallback, useEffect, useState } from 'react'
import type { OnboardingView } from '@/lib/onboarding/view'
import { fetchOnboardingView } from './onboarding-api'
import { OnboardingWizard } from './onboarding-wizard'
import { OnboardingBuilding } from './onboarding-building'
import { OnboardingReveal } from './onboarding-reveal'
import { accentStyle } from './onboarding-theme'

const POLL_INTERVAL_MS = 2500

/**
 * Wizard → live build → reveal. Polls only while something is being built.
 * After the wizard, the pages wear the brand color the build applied.
 */
export function OnboardingFlow({ token, initialView }: { token: string; initialView: OnboardingView }) {
  const [view, setView] = useState(initialView)
  const isBuilding = view.status === 'queued' || view.status === 'running'

  const refresh = useCallback(async () => {
    const result = await fetchOnboardingView(token)
    if (result.ok) setView(result.data)
  }, [token])

  useEffect(() => {
    if (!isBuilding) return
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isBuilding, refresh])

  // The server accepted the request, so the build is queued: show progress at
  // once and let the poll fill in the steps, even if this first read fails.
  const markQueued = useCallback(() => {
    setView((current) => ({ ...current, status: 'queued' }))
    void refresh()
  }, [refresh])

  if (view.status === 'awaiting_details') {
    return <OnboardingWizard token={token} view={view} onSubmitted={markQueued} />
  }

  const brand = view.summary?.brandColor ?? view.assets.logoColor ?? null
  return (
    <div style={accentStyle(brand, '')}>
      {isBuilding || !view.store
        ? <OnboardingBuilding view={view} />
        : <OnboardingReveal token={token} view={view} onRefresh={markQueuedOrRefresh(view, markQueued, refresh)} />}
    </div>
  )
}

/** A retry re-queues the build; a launch only needs a fresh read. */
function markQueuedOrRefresh(view: OnboardingView, markQueued: () => void, refresh: () => Promise<void>): () => void {
  return view.status === 'failed' ? markQueued : () => void refresh()
}
