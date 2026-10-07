'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Circle, ExternalLink, Loader2, MinusCircle, RotateCw, X } from 'lucide-react'
import type { OnboardingStepView, OnboardingView } from '@/lib/onboarding/view'
import type { StepStatus } from '@/lib/onboarding/plan'
import { retryOnboarding } from './onboarding-api'
import { ONBOARDING_COLORS, PrimaryLink } from './onboarding-ui'
import { FirstWeekPlan } from './first-week-plan'

const STEP_ICONS: Record<StepStatus, React.ReactNode> = {
  pending: <Circle className="h-5 w-5 text-black/25" aria-hidden />,
  running: <Loader2 className="h-5 w-5 animate-spin" style={{ color: ONBOARDING_COLORS.red }} aria-hidden />,
  done: <Check className="h-5 w-5 text-emerald-600" aria-hidden />,
  skipped: <MinusCircle className="h-5 w-5 text-black/35" aria-hidden />,
  failed: <X className="h-5 w-5 text-red-600" aria-hidden />,
}

function StepList({ steps }: { steps: OnboardingStepView[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step) => (
        <li key={step.id} className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <span className="mt-0.5">{STEP_ICONS[step.status]}</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold" style={{ color: ONBOARDING_COLORS.ink }}>{step.label}</span>
            {step.detail && step.status !== 'running' && (
              <span className="block text-xs" style={{ color: step.status === 'failed' ? '#B91C1C' : ONBOARDING_COLORS.cocoa }}>{step.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: ONBOARDING_COLORS.red }}>{title}</p>
      <div className="mt-1.5 text-sm" style={{ color: ONBOARDING_COLORS.ink }}>{children}</div>
    </div>
  )
}

function BuildSummary({ view }: { view: OnboardingView }) {
  const summary = view.summary
  if (!summary) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {summary.menu && (
        <SummaryCard title="Menu">
          {summary.menu.items} items in {summary.menu.categories} categories
          {summary.bestSellerNames.length > 0 && <span className="block text-xs text-black/60">Featured: {summary.bestSellerNames.join(', ')}</span>}
        </SummaryCard>
      )}
      {summary.offers.length > 0 && (
        <SummaryCard title="Combos & upsells">
          <ul className="space-y-0.5">{summary.offers.map((offer) => <li key={`${offer.kind}-${offer.title}`}>• {offer.title}</li>)}</ul>
        </SummaryCard>
      )}
      {summary.loyalty && (
        <SummaryCard title="Loyalty stamp card">
          {summary.loyalty.threshold} orders → {summary.loyalty.rewardLabel}
        </SummaryCard>
      )}
      {summary.brandColor && (
        <SummaryCard title="Your colors">
          <span className="inline-flex items-center gap-2">
            <span className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: summary.brandColor }} aria-hidden />
            Picked from your logo
          </span>
        </SummaryCard>
      )}
    </div>
  )
}

function launchMessage(view: OnboardingView): string {
  if (view.store?.isLive) return 'Your store is live and taking orders. 🎉'
  if (view.isLaunchRequested) return 'Launch requested — your store opens the moment we confirm your payment.'
  if (view.isPaymentConfirmed) return 'Payment confirmed. Log in, review your store, then press Launch.'
  return 'While we confirm your payment, log in and look everything over. Nothing is public yet.'
}

function ReadyActions({ view }: { view: OnboardingView }) {
  if (!view.store) return null
  return (
    <div className="space-y-3">
      <p className="rounded-2xl p-4 text-sm font-medium" style={{ backgroundColor: ONBOARDING_COLORS.cream, color: ONBOARDING_COLORS.ink }}>
        {launchMessage(view)}
      </p>
      <PrimaryLink href={view.store.loginPath}>Log in to review & launch</PrimaryLink>
      <a
        href={view.store.previewPath}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-black/15 bg-white text-sm font-bold"
        style={{ color: ONBOARDING_COLORS.ink }}
      >
        Preview your store <ExternalLink className="h-4 w-4" aria-hidden />
      </a>
      <p className="text-center text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>Log in with {view.ownerEmail}</p>
    </div>
  )
}

export function OnboardingProgress({ token, view, onRetried }: { token: string; view: OnboardingView; onRetried: () => void }) {
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const isBuilding = view.status === 'queued' || view.status === 'running'
  const isReady = view.status === 'ready'

  async function retry() {
    setIsRetrying(true)
    const result = await retryOnboarding(token)
    setIsRetrying(false)
    if (!result.ok) return setRetryError(result.error)
    setRetryError(null)
    onRetried()
  }

  const heading = isReady ? `${view.store?.name ?? 'Your store'} is ready` : isBuilding ? 'Building your store…' : 'Almost there'
  const subheading = isReady
    ? 'Here is everything we set up for you.'
    : isBuilding
      ? 'This takes a minute or two. You can keep this page open.'
      : 'A step did not finish. Your store is safe — retry, or fix it later from your dashboard.'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: ONBOARDING_COLORS.ink }}>{heading}</h1>
        <p className="mt-1 text-sm" style={{ color: ONBOARDING_COLORS.cocoa }}>{subheading}</p>
      </div>

      <StepList steps={view.steps} />

      {view.status === 'failed' && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={retry}
            disabled={isRetrying}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 bg-white text-sm font-bold"
            style={{ borderColor: ONBOARDING_COLORS.red, color: ONBOARDING_COLORS.red }}
          >
            {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCw className="h-4 w-4" aria-hidden />}
            Retry the unfinished steps
          </button>
          {retryError && <p className="text-sm text-red-700">{retryError}</p>}
        </div>
      )}

      {!isBuilding && <BuildSummary view={view} />}

      {!isBuilding && (view.summary?.warnings.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlertTriangle className="h-4 w-4" aria-hidden /> Please check</p>
          <ul className="mt-1.5 space-y-1 text-sm text-amber-900">{view.summary?.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>
        </div>
      )}

      {!isBuilding && <ReadyActions view={view} />}

      {!isBuilding && view.store && view.firstWeek && (
        <FirstWeekPlan plan={view.firstWeek} storeSlug={view.store.slug} ownerEmail={view.ownerEmail} />
      )}
    </div>
  )
}
