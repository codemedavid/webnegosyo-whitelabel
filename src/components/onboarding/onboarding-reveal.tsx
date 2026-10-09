'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { ArrowUpRight, Check, Copy, Download, Loader2, QrCode, RotateCw, Share2 } from 'lucide-react'
import type { BoostIdeaKind } from '@/lib/boost/ideas'
import type { OnboardingView } from '@/lib/onboarding/view'
import { STORE_LOOKS, isStoreLook } from '@/lib/onboarding/store-type'
import { LAUNCH_HERO_LABELS, isLaunchHeroChoice } from '@/lib/onboarding/launch-heroes'
import { launchOnboardingStore, retryOnboarding } from './onboarding-api'
import { ACCENT_SOFT, FOCUS_RING, OB, PrimaryButton, PrimaryLink, SecondaryButton, SecondaryLink, StepHeading } from './onboarding-ui'
import { LiveStoreFrame } from './store-preview-phone'
import { FirstWeekPlan } from './first-week-plan'
import { Celebration } from './celebration'

/**
 * The store is built. Live: the link to share, with a QR for the counter.
 * Not live yet: exactly what stands in the way and one button to open it.
 * Then what we set up, and the first-week guide.
 */

const COPIED_RESET_MS = 2000
const QR_SIZE_PX = 640

function useOrigin(): string {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  return origin
}

function ShareLink({ storeUrl, storeName }: { storeUrl: string; storeName: string }) {
  const [isCopied, setIsCopied] = useState(false)
  const [isQrOpen, setIsQrOpen] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  const displayUrl = storeUrl.replace(/^https?:\/\//, '')

  async function copy() {
    try {
      await navigator.clipboard.writeText(storeUrl)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), COPIED_RESET_MS)
    } catch {
      setIsCopied(false)
    }
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: storeName, text: `Order from ${storeName} online`, url: storeUrl })
        return
      } catch {
        // Cancelled or refused: fall through to Facebook.
      }
    }
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(storeUrl)}`, '_blank', 'noopener,noreferrer')
  }

  function downloadQr() {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `${storeName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'store'}-qr.png`
    link.click()
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border p-1.5 pl-4" style={{ borderColor: OB.lineStrong }}>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold" style={{ color: OB.ink }}>{displayUrl}</span>
        <button type="button" onClick={copy}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors hover:bg-[#ECE7E1] ${FOCUS_RING}`}
          style={{ backgroundColor: OB.wash, color: OB.ink }}>
          {isCopied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          <span aria-live="polite">{isCopied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <SecondaryLink href={storeUrl} isExternal>Open <ArrowUpRight className="h-4 w-4" aria-hidden /></SecondaryLink>
        <SecondaryButton onClick={share}><Share2 className="h-4 w-4" aria-hidden /> Share</SecondaryButton>
        <SecondaryButton onClick={() => setIsQrOpen(!isQrOpen)}><QrCode className="h-4 w-4" aria-hidden /> QR</SecondaryButton>
      </div>
      {isQrOpen && (
        <div className="mt-3 flex items-center gap-5 rounded-xl border p-4 animate-in fade-in slide-in-from-top-1 duration-300" style={{ borderColor: OB.line }}>
          <div ref={qrRef} className="w-28 shrink-0 [&_canvas]:!h-auto [&_canvas]:!w-full">
            <QRCodeCanvas value={storeUrl} size={QR_SIZE_PX} marginSize={2} level="M" title={`QR code for ${displayUrl}`} />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold" style={{ color: OB.ink }}>Put it on your counter</p>
            <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: OB.muted }}>Customers scan it to order. Print it on a table tent or your packaging.</p>
            <button type="button" onClick={downloadQr}
              className={`mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold underline decoration-1 underline-offset-4 ${FOCUS_RING}`}
              style={{ color: OB.ink }}>
              <Download className="h-4 w-4" aria-hidden /> Download PNG
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface OpenStoreProps {
  token: string
  view: OnboardingView
  onLaunched: () => void
}

/** Not live yet: name what blocks it, then one button. */
function OpenStorePanel({ token, view, onLaunched }: OpenStoreProps) {
  const [isLaunching, setIsLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blockers = view.launch?.blockers ?? []
  const dashboardPath = view.store?.dashboardPath ?? '#'

  async function goLive() {
    setIsLaunching(true)
    setError(null)
    const result = await launchOnboardingStore(token)
    setIsLaunching(false)
    if (!result.ok) return setError(result.error)
    onLaunched()
  }

  if (!view.isPaymentConfirmed) {
    return <p className="text-[15px] leading-relaxed" style={{ color: OB.muted }}>Your store opens as soon as we confirm your payment. Look everything over in the meantime.</p>
  }

  return (
    <div className="space-y-4">
      {blockers.length > 0 && (
        <ul className="divide-y rounded-xl border" style={{ borderColor: OB.line }}>
          {blockers.map((blocker) => (
            <li key={blocker} className="flex items-center gap-3 px-4 py-3.5" style={{ borderColor: OB.line }}>
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
              <span className="min-w-0 flex-1 text-[15px] font-semibold" style={{ color: OB.ink }}>{blocker}</span>
              <a href={dashboardPath} className={`-my-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold underline decoration-1 underline-offset-4 ${FOCUS_RING}`} style={{ color: OB.ink }}>Fix</a>
            </li>
          ))}
        </ul>
      )}
      <PrimaryButton onClick={goLive} isDisabled={view.launch?.canLaunch !== true || isLaunching} isFull>
        {isLaunching && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {isLaunching ? 'Opening your store…' : 'Open my store'}
      </PrimaryButton>
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  )
}

function RetryFailedSteps({ token, view, onRetried }: { token: string; view: OnboardingView; onRetried: () => void }) {
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
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-[15px] font-semibold text-amber-950">A few things did not finish</p>
      <ul className="mt-1 space-y-0.5 text-sm text-amber-950">{failed.map((step) => <li key={step.id}>{step.detail ?? step.label}</li>)}</ul>
      <button type="button" onClick={retry} disabled={isRetrying}
        className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-950 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}>
        {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCw className="h-4 w-4" aria-hidden />} Try again
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

const OFFER_NOUNS: Record<BoostIdeaKind, [string, string]> = {
  combo: ['combo', 'combos'],
  upgrade: ['upgrade', 'upgrades'],
  pairing: ['pairing', 'pairings'],
  last_call: ['cart suggestion', 'cart suggestions'],
}

/** "2 combos, 1 pairing": counts read faster than a run of dish names. */
function offerCounts(offers: ReadonlyArray<{ kind: BoostIdeaKind }>): string {
  const counts = new Map<BoostIdeaKind, number>()
  offers.forEach((offer) => counts.set(offer.kind, (counts.get(offer.kind) ?? 0) + 1))
  return [...counts].map(([kind, count]) => plural(count, ...OFFER_NOUNS[kind])).join(', ')
}

/** What the build made, as a plain ledger: label, value, where to change it. */
function BuiltLedger({ view }: { view: OnboardingView }) {
  const summary = view.summary
  const dashboard = view.store?.dashboardPath ?? ''
  if (!summary) return null
  const rows = [
    summary.design && isStoreLook(summary.design.look) && { label: 'Design', value: `${STORE_LOOKS[summary.design.look].label}. ${summary.design.reason}`, href: `${dashboard}/branding` },
    summary.design?.hero && isLaunchHeroChoice(summary.design.hero) && {
      label: 'Hero',
      value: summary.design.hero === 'none' ? 'None, your menu starts at the top' : LAUNCH_HERO_LABELS[summary.design.hero],
      href: `${dashboard}/hero-designer`,
    },
    summary.menu && { label: 'Menu', value: `${plural(summary.menu.items, 'dish', 'dishes')} in ${plural(summary.menu.categories, 'category', 'categories')}`, href: `${dashboard}/menu` },
    summary.paymentMethods.length > 0 && { label: 'Payments', value: summary.paymentMethods.join(', '), href: `${dashboard}/payment-methods` },
    summary.offers.length > 0 && { label: 'Offers', value: offerCounts(summary.offers), href: `${dashboard}/boost-sales` },
    summary.loyalty && { label: 'Stamp card', value: `${summary.loyalty.threshold} orders → ${summary.loyalty.rewardLabel}`, href: `${dashboard}/loyalty` },
  ].filter((row): row is { label: string; value: string; href: string } => !!row)

  return (
    <section aria-labelledby="built-heading">
      <h2 id="built-heading" className="text-[17px] font-bold" style={{ color: OB.ink }}>What we set up</h2>
      <dl className="mt-3 border-t" style={{ borderColor: OB.line }}>
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-4 border-b py-3.5" style={{ borderColor: OB.line }}>
            <dt className="w-24 shrink-0 text-[13px] font-medium" style={{ color: OB.muted }}>{row.label}</dt>
            <dd className="min-w-0 flex-1 text-[15px] leading-snug" style={{ color: OB.ink }}>{row.value}</dd>
            <a href={row.href} className={`-my-2 -mr-2 inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-[13px] font-semibold underline decoration-1 underline-offset-4 ${FOCUS_RING}`} style={{ color: OB.ink }}>Edit</a>
          </div>
        ))}
      </dl>
      {summary.warnings.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {summary.warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: OB.muted }}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />{warning}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}

function revealLede(isLive: boolean, opensLabel: string | null): string {
  if (!isLive) return 'Everything is built. Clear what is left below and open your store.'
  if (opensLabel) return `You're outside your opening hours, so orders start ${opensLabel}. Share your link now — customers can already browse your menu.`
  return 'Customers can order right now. Share your link — your first order is close.'
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
  const storeUrl = `${origin}${store.previewPath}`

  function handleLaunched() {
    setHasLaunched(true)
    onRefresh()
  }

  return (
    <div className="lg:grid lg:grid-cols-2">
      <div className="px-5 pb-20 pt-8 sm:px-8 lg:flex lg:justify-center lg:px-12 lg:pt-16">
        <div className="relative mx-auto w-full max-w-[34rem] space-y-10">
          {isLive && <Celebration />}
          <StepHeading
            title={isLive ? `${store.name} is open.` : `${store.name} is almost open.`}
            lede={revealLede(isLive, store.opensLabel)}
          />

          <div className="mx-auto w-full max-w-[230px] lg:hidden">
            <LiveStoreFrame path={store.previewPath} title={`${store.name} storefront`} version={isLive ? 1 : 0} />
          </div>

          <RetryFailedSteps token={token} view={view} onRetried={onRefresh} />

          {isLive
            ? origin && <ShareLink storeUrl={storeUrl} storeName={store.name} />
            : <OpenStorePanel token={token} view={view} onLaunched={handleLaunched} />}

          <BuiltLedger view={view} />

          <div className="space-y-3">
            <PrimaryLink href={store.dashboardPath} isFull>Go to my dashboard</PrimaryLink>
            <p className="text-center text-[13px]" style={{ color: OB.muted }}>Your login: <b style={{ color: OB.ink }}>{view.ownerEmail}</b></p>
          </div>

          {view.firstWeek && <FirstWeekPlan plan={view.firstWeek} storeSlug={store.slug} ownerEmail={view.ownerEmail} />}
        </div>
      </div>

      <aside className="hidden lg:block lg:p-4" aria-label="Your store">
        <div className="sticky top-4 flex h-[calc(100dvh-6rem)] min-h-[560px] flex-col items-center justify-center rounded-3xl" style={{ backgroundColor: ACCENT_SOFT }}>
          <div className="w-full max-w-[290px]">
            <LiveStoreFrame path={store.previewPath} title={`${store.name} storefront`} version={isLive ? 1 : 0} />
          </div>
          <p className="mt-5 text-[13px] font-medium" style={{ color: OB.muted }}>
            {isLive ? 'Your real store. Tap around.' : 'Your store, ready to open.'}
          </p>
        </div>
      </aside>
    </div>
  )
}
