'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, Link2, Loader2, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { fetchLeadOnboarding, issueLeadSetupLink, retryLeadOnboardingBuild } from '@/app/actions/checkout-leads'
import type { LeadOnboardingSummary } from '@/lib/onboarding/staff'
import { canSendSetupLink } from '@/lib/onboarding/invite'
import { SetupInviteShare, type SetupInviteContact } from './setup-invite-share'

const STATUS_LABELS: Record<LeadOnboardingSummary['status'], string> = {
  awaiting_details: 'Link sent — waiting for the buyer to fill in the set-up',
  queued: 'Queued to build',
  running: 'Building now',
  ready: 'Built — waiting for the owner to go live',
  failed: 'Build stopped — retry',
}

function launchLine(summary: LeadOnboardingSummary): string {
  if (summary.store?.isLive) return 'Store is LIVE.'
  if (summary.isLaunchRequested) return 'Owner pressed Launch — mark the lead "Paid" to open the store.'
  return 'The owner opens it with "Go live" at the end of their set-up.'
}

interface CheckoutLeadOnboardingProps {
  leadId: string
  leadStatus: string
  contact: SetupInviteContact
  canEdit: boolean
}

/**
 * The lead's automated store set-up: the set-up link (only once the payment
 * is confirmed), build progress, the store it built, and a retry for a
 * failed build.
 */
export function CheckoutLeadOnboarding({ leadId, leadStatus, contact, canEdit }: CheckoutLeadOnboardingProps) {
  const [summary, setSummary] = useState<LeadOnboardingSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  /** The link just issued — shown once, since only its hash is stored. */
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null)
  /** Only the latest read may land: switching leads must not show the previous lead's set-up. */
  const loadSeqRef = useRef(0)
  const isPaid = canSendSetupLink(leadStatus)

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current
    setIsLoading(true)
    try {
      const next = await fetchLeadOnboarding(leadId)
      if (seq !== loadSeqRef.current) return
      setSummary(next)
      setLoadError(null)
    } catch (error) {
      if (seq !== loadSeqRef.current) return
      console.error('[checkout-leads] onboarding read failed', error)
      setSummary(null)
      setLoadError('Could not load the store set-up. Close and reopen this lead to try again.')
    } finally {
      if (seq === loadSeqRef.current) setIsLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    setIssuedUrl(null)
    void load()
  }, [load, leadStatus])

  async function sendLink() {
    setIsBusy(true)
    try {
      const result = await issueLeadSetupLink(leadId)
      if (!result.path) return void toast.error(result.error ?? 'Could not create a link')
      setIssuedUrl(`${window.location.origin}${result.path}`)
      void load()
    } catch (error) {
      console.error('[checkout-leads] set-up link failed', error)
      toast.error('Could not create a link')
    } finally {
      setIsBusy(false)
    }
  }

  async function retry() {
    setIsBusy(true)
    try {
      const result = await retryLeadOnboardingBuild(leadId)
      if (result.error) return void toast.error(result.error)
      toast.success('Retrying the build')
      void load()
    } catch (error) {
      console.error('[checkout-leads] onboarding retry failed', error)
      toast.error('Could not retry the build')
    } finally {
      setIsBusy(false)
    }
  }

  if (isLoading && !summary) return <Loader2 className="h-4 w-4 animate-spin text-white/45" />

  const canSendLink = canEdit && isPaid && !loadError && (!summary || summary.status === 'awaiting_details')

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/80">
      {loadError ? (
        <p role="alert" className="text-red-300">{loadError}</p>
      ) : summary ? (
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
        <p className="text-white/60">
          {isPaid ? 'Paid — send the set-up link so they can build their store.' : 'The set-up link unlocks once this lead is marked Paid.'}
        </p>
      )}

      {issuedUrl && <SetupInviteShare url={issuedUrl} contact={contact} />}

      {canEdit && !loadError && (
        <div className="flex flex-wrap gap-2">
          {canSendLink && !issuedUrl && (
            <button type="button" onClick={sendLink} disabled={isBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50">
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              {summary ? 'Send a new set-up link' : 'Send set-up link'}
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
