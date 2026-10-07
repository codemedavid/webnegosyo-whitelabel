'use client'

import { useCallback, useEffect, useState } from 'react'
import type { OnboardingView } from '@/lib/onboarding/view'
import { fetchOnboardingView } from './onboarding-api'
import { OnboardingWizard } from './onboarding-wizard'
import { OnboardingProgress } from './onboarding-progress'

const POLL_INTERVAL_MS = 2500

/**
 * Wizard until the store is created, then live progress until the build
 * settles. Polls only while something is actually being built.
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
  return <OnboardingProgress token={token} view={view} onRetried={markQueued} />
}
