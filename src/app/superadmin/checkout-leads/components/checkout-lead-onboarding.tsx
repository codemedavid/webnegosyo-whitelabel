'use client'

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Link2, Loader2, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { fetchLeadOnboarding, issueLeadSetupLink, retryLeadOnboardingBuild } from '@/app/actions/checkout-leads'
import type { LeadOnboardingSummary } from '@/lib/onboarding/staff'

const STATUS_LABELS: Record<LeadOnboardingSummary['status'], string> = {
  awaiting_details: 'Waiting for the buyer to fill in the wizard',
  queued: 'Queued to build',
  running: 'Building now',
  ready: 'Built — waiting for launch',
  failed: 'Build stopped — retry',
}

function launchLine(summary: LeadOnboardingSummary): string {
  if (summary.store?.isLive) return 'Store is LIVE.'
  if (summary.isLaunchRequested) return 'Owner pressed Launch — mark the lead "Paid" to open the store.'
  return 'Owner has not pressed Launch yet. Marking "Paid" records the payment; the store opens when they launch.'
}

/**
 * The lead's automated store set-up: progress, the store it built, and the
 * two staff levers — a fresh set-up link and a retry of a failed build.
 */
export function CheckoutLeadOnboarding({ leadId, canEdit, refreshKey }: { leadId: string; canEdit: boolean; refreshKey: string }) {
  const [summary, setSummary] = useState<LeadOnboardingSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setSummary(await fetchLeadOnboarding(leadId))
    } finally {
      setIsLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function copyNewLink() {
    setIsBusy(true)
    const result = await issueLeadSetupLink(leadId)
    setIsBusy(false)
    if (!result.path) return void toast.error(result.error ?? 'Could not create a link')
    const url = `${window.location.origin}${result.path}`
    await navigator.clipboard.writeText(url).catch(() => undefined)
    toast.success('New set-up link copied. The previous link no longer works.')
    void load()
  }

  async function retry() {
    setIsBusy(true)
    const result = await retryLeadOnboardingBuild(leadId)
    setIsBusy(false)
    if (result.error) return void toast.error(result.error)
    toast.success('Retrying the build')
    void load()
  }

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-white/45" />

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/80">
      {summary ? (
        <>
          <p className="font-medium text-white">{STATUS_LABELS[summary.status]}</p>
          {summary.error && <p className="text-xs text-red-300">{summary.error}</p>}
          {summary.store && (
            <>
              <a href={`/${summary.store.slug}/admin/launch`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-white underline underline-offset-2">
                {summary.store.name} <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <p className="text-xs text-white/60">{launchLine(summary)}</p>
            </>
          )}
        </>
      ) : (
        <p className="text-white/60">No store set-up for this lead yet.</p>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {(!summary || summary.status === 'awaiting_details') && (
            <button type="button" onClick={copyNewLink} disabled={isBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5">
              <Link2 className="h-3.5 w-3.5" /> Copy new set-up link
            </button>
          )}
          {summary?.status === 'failed' && (
            <button type="button" onClick={retry} disabled={isBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5">
              <RotateCw className="h-3.5 w-3.5" /> Retry build
            </button>
          )}
        </div>
      )}
    </div>
  )
}
