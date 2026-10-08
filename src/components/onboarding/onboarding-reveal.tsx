'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowUpRight, Check, Copy, GraduationCap, LayoutDashboard, Loader2, PartyPopper, Rocket, RotateCw, Share2 } from 'lucide-react'
import type { BoostIdeaKind } from '@/lib/boost/ideas'
import type { OnboardingView } from '@/lib/onboarding/view'
import { launchOnboardingStore, retryOnboarding } from './onboarding-api'
import { ACCENT, ACCENT_SOFT, Card, DISPLAY_FONT, Eyebrow, ONBOARDING_COLORS, PrimaryButton, PrimaryLink, SecondaryLink } from './onboarding-ui'
import { LiveStoreFrame } from './store-preview-phone'
import { FirstWeekPlan } from './first-week-plan'
import { Celebration } from './celebration'

/**
 * "Your store is ready": the real storefront, what was built, the owner's
 * one-tap Go live, and where to learn the rest (app + University).
 */

const OFFER_LABELS: Record<BoostIdeaKind, string> = {
  combo: 'Combo',
  upgrade: 'Upgrade',
  pairing: 'Pairing',
  last_call: 'Cart last call',
}

function useOrigin(): string {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  return origin
}

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <p className="text-3xl font-extrabold tabular-nums" style={{ color: ACCENT, fontFamily: DISPLAY_FONT }}>{value}</p>
      <p className="mt-0.5 text-xs font-semibold" style={{ color: ONBOARDING_COLORS.cocoa }}>{label}</p>
    </div>
  )
}

function LiveCard({ storeUrl, storeName }: { storeUrl: string; storeName: string }) {
  const [isCopied, setIsCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(storeUrl)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      setIsCopied(false)
    }
  }
  const shareHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(storeUrl)}`
  return (
    <div className="rounded-3xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #1F9D55, #127a40)' }}>
      <p className="flex items-center gap-2 text-sm font-bold"><PartyPopper className="h-5 w-5" aria-hidden /> {storeName} is live!</p>
      <p className="mt-1 text-sm text-white/85">Customers can order now. Post your link everywhere — your first order is close.</p>
      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/15 p-2 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{storeUrl.replace(/^https?:\/\//, '')}</span>
        <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-800">
          {isCopied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {isCopied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-white/15 text-sm font-bold">
          Open store <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
        <a href={shareHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-white/15 text-sm font-bold">
          <Share2 className="h-4 w-4" aria-hidden /> Share on Facebook
        </a>
      </div>
    </div>
  )
}

interface GoLiveCardProps {
  token: string
  view: OnboardingView
  onLaunched: () => void
}

function GoLiveCard({ token, view, onLaunched }: GoLiveCardProps) {
  const [isLaunching, setIsLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function goLive() {
    setIsLaunching(true)
    setError(null)
    const result = await launchOnboardingStore(token)
    setIsLaunching(false)
    if (!result.ok) return setError(result.error)
    onLaunched()
  }

  if (!view.isPaymentConfirmed) {
    return (
      <Card>
        <p className="text-sm font-bold" style={{ color: ONBOARDING_COLORS.ink }}>Almost there</p>
        <p className="mt-1 text-sm" style={{ color: ONBOARDING_COLORS.cocoa }}>Your store opens as soon as we confirm your payment. Look everything over in the meantime.</p>
      </Card>
    )
  }

  const blockers = view.launch?.blockers ?? []
  const canLaunch = view.launch?.canLaunch === true
  return (
    <div className="rounded-3xl border-2 p-5" style={{ borderColor: ACCENT, backgroundColor: ACCENT_SOFT }}>
      <p className="flex items-center gap-2 text-base font-extrabold" style={{ color: ONBOARDING_COLORS.ink }}>
        <Rocket className="h-5 w-5" style={{ color: ACCENT }} aria-hidden /> Ready when you are
      </p>
      <p className="mt-1 text-sm" style={{ color: ONBOARDING_COLORS.cocoa }}>
        Check your menu prices in the preview, then go live. Customers can order the moment you tap.
      </p>
      {blockers.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm font-medium text-amber-900">
          {blockers.map((blocker) => <li key={blocker}>• {blocker} — fix it in your dashboard</li>)}
        </ul>
      )}
      <div className="mt-4">
        <PrimaryButton onClick={goLive} isDisabled={!canLaunch || isLaunching}>
          {isLaunching ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Rocket className="h-5 w-5" aria-hidden />}
          {isLaunching ? 'Opening your store…' : 'Go live'}
        </PrimaryButton>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </div>
  )
}

function RetryBanner({ token, view, onRetried }: { token: string; view: OnboardingView; onRetried: () => void }) {
  const [isRetrying, setIsRetrying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const failed = view.steps.filter((step) => step.status === 'failed')
  if (view.status !== 'failed' || failed.length === 0) return null

  async function retry() {
    setIsRetrying(true)
    const result = await retryOnboarding(token)
    setIsRetrying(false)
    if (!result.ok) return setError(result.error)
    onRetried()
  }

  return (
    <div className="rounded-3xl border border-amber-300 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlertTriangle className="h-4 w-4" aria-hidden /> A few things did not finish</p>
      <ul className="mt-1.5 space-y-1 text-sm text-amber-900">{failed.map((step) => <li key={step.id}>• {step.detail ?? step.label}</li>)}</ul>
      <button type="button" onClick={retry} disabled={isRetrying} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-amber-900 px-4 text-sm font-bold text-white disabled:opacity-60">
        {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCw className="h-4 w-4" aria-hidden />} Try those again
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

function GrowthKit({ view }: { view: OnboardingView }) {
  const summary = view.summary
  if (!summary || (summary.offers.length === 0 && !summary.loyalty)) return null
  return (
    <Card>
      <Eyebrow>Your growth kit — already on</Eyebrow>
      <ul className="mt-3 space-y-2.5">
        {summary.loyalty && (
          <li className="flex items-start gap-3">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">Loyalty</span>
            <span className="text-sm" style={{ color: ONBOARDING_COLORS.ink }}>Stamp card: {summary.loyalty.threshold} orders → {summary.loyalty.rewardLabel}</span>
          </li>
        )}
        {summary.offers.map((offer) => (
          <li key={`${offer.kind}-${offer.title}`} className="flex items-start gap-3">
            <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}>{OFFER_LABELS[offer.kind]}</span>
            <span className="text-sm" style={{ color: ONBOARDING_COLORS.ink }}>{offer.title}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>Edit or pause any of these in Boost Sales and Loyalty.</p>
    </Card>
  )
}

interface OnboardingRevealProps {
  token: string
  view: OnboardingView
  onRefresh: () => void
}

export function OnboardingReveal({ token, view, onRefresh }: OnboardingRevealProps) {
  const origin = useOrigin()
  const [hasLaunched, setHasLaunched] = useState(false)
  const store = view.store
  if (!store) return null

  const isLive = store.isLive || hasLaunched
  const summary = view.summary
  const storeUrl = `${origin}${store.previewPath}`

  function handleLaunched() {
    setHasLaunched(true)
    onRefresh()
  }

  return (
    <div className="space-y-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
        <div className="relative min-w-0 space-y-6">
          <Celebration />
          <div>
            <Eyebrow>{isLive ? 'You are live' : 'Your store is ready'}</Eyebrow>
            <h1 className="mt-1.5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl" style={{ color: ONBOARDING_COLORS.ink, fontFamily: DISPLAY_FONT }}>
              {store.name} {isLive ? 'is open for orders.' : 'is ready.'}
            </h1>
            <p className="mt-2 text-[15px]" style={{ color: ONBOARDING_COLORS.cocoa }}>Here is everything we set up for you — in about a minute.</p>
          </div>

          <RetryBanner token={token} view={view} onRetried={onRefresh} />

          {isLive && origin ? <LiveCard storeUrl={storeUrl} storeName={store.name} /> : <GoLiveCard token={token} view={view} onLaunched={handleLaunched} />}

          {summary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile value={summary.menu?.items ?? 0} label="Menu items" />
              <StatTile value={summary.menu?.categories ?? 0} label="Categories" />
              <StatTile value={summary.offers.length} label="Combos & upsells" />
              <StatTile value={summary.loyalty ? '✓' : '—'} label="Stamp card" />
            </div>
          )}

          <GrowthKit view={view} />

          {(summary?.warnings.length ?? 0) > 0 && (
            <Card>
              <p className="flex items-center gap-2 text-sm font-bold" style={{ color: ONBOARDING_COLORS.ink }}><AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden /> Worth a quick check</p>
              <ul className="mt-2 space-y-1 text-sm" style={{ color: ONBOARDING_COLORS.cocoa }}>{summary?.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <PrimaryLink href={store.dashboardPath}><LayoutDashboard className="h-5 w-5" aria-hidden /> Open my dashboard</PrimaryLink>
            <SecondaryLink href={`${store.dashboardPath}/menu`}>Review my menu</SecondaryLink>
          </div>
          <p className="text-center text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>Your login: <b>{view.ownerEmail}</b></p>
        </div>

        <aside aria-label="Your store">
          <div className="lg:sticky lg:top-8">
            <LiveStoreFrame path={store.previewPath} title={`${store.name} storefront`} version={isLive ? 1 : 0} />
            <p className="mt-4 text-center text-xs font-medium" style={{ color: ONBOARDING_COLORS.cocoa }}>Your real store — tap around.</p>
          </div>
        </aside>
      </div>

      {view.firstWeek && (
        <section className="space-y-5" aria-labelledby="learn-heading">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: ACCENT_SOFT }}>
              <GraduationCap className="h-6 w-6" style={{ color: ACCENT }} aria-hidden />
            </span>
            <div>
              <h2 id="learn-heading" className="text-2xl font-extrabold tracking-tight" style={{ color: ONBOARDING_COLORS.ink, fontFamily: DISPLAY_FONT }}>
                Learn your store in 10 minutes
              </h2>
              <p className="text-sm" style={{ color: ONBOARDING_COLORS.cocoa }}>
                Get the app, then follow the short videos in <a href={view.firstWeek.courseHref} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2" style={{ color: ACCENT }}>SmartMenu University</a>.
              </p>
            </div>
          </div>
          <FirstWeekPlan plan={view.firstWeek} storeSlug={store.slug} ownerEmail={view.ownerEmail} />
        </section>
      )}
    </div>
  )
}
