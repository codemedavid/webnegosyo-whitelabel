'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import type { OnboardingView } from '@/lib/onboarding/view'
import { shareHint } from '@/lib/onboarding/goals'
import { ACCENT, ACCENT_INK, ACCENT_SOFT, OB, PrimaryLink, SecondaryLink, TextButton } from './onboarding-ui'
import { LiveStoreFrame } from './store-preview-phone'
import { Celebration } from './celebration'
import { OpenStorePanel, RetryFailedSteps, ShareLink, useOrigin } from './reveal-peak'
import { ComboChoice, StampChoice, TextsChoice, type ChoiceId } from './reveal-choices'
import { fetchLaunchCombos, trackOnboardingEvent } from './onboarding-api'
import type { LaunchComboView } from '@/lib/onboarding/launch-offers'

/**
 * The store is built. First the peak: it's open, share your link (one
 * message, one action). Then three quick choices (combos to keep, the stamp
 * card, the texts), then the owner's Start-here path in their dashboard.
 * The build's ledger and warnings live on Start here, not on this screen.
 */

type Phase = 'peak' | ChoiceId | 'done'

/** The choices this build has something for, in order. */
function choicesFor(view: OnboardingView): ChoiceId[] {
  const summary = view.summary
  return [
    (summary?.offersAwaitingApproval?.length ?? 0) > 0 ? 'combos' as const : null,
    summary?.loyalty ? 'stamp' as const : null,
    (summary?.campaigns?.drafted ?? 0) > 0 ? 'texts' as const : null,
  ].filter((choice): choice is ChoiceId => choice !== null)
}

function Peak({ view, token, isLive, storeUrl, choiceCount, onNext, onRefresh, onLaunched }: {
  view: OnboardingView
  token: string
  isLive: boolean
  storeUrl: string
  choiceCount: number
  onNext: () => void
  onRefresh: () => void
  onLaunched: () => void
}) {
  const store = view.store!
  const lede = !isLive
    ? 'Everything is built. Clear what is left below and open your store.'
    : store.opensLabel
      ? `You're outside your opening hours, so orders start ${store.opensLabel}. Share your link now so customers can look at your menu.`
      : `Customers can order now. ${shareHint(view.channels)}`

  return (
    <div className="relative space-y-8">
      {isLive && <Celebration />}
      <div className="flex h-24 items-center justify-center gap-3 rounded-3xl px-6 text-center text-[22px] font-extrabold tracking-tight" style={{ backgroundColor: ACCENT, color: ACCENT_INK }}>
        {view.assets.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.assets.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full bg-white object-contain p-1" />
        )}
        <span className="min-w-0 truncate">{store.name}</span>
      </div>
      <div>
        <h1 tabIndex={-1} className="text-balance text-[2.25rem] font-extrabold leading-[1.05] tracking-[-0.03em] outline-none sm:text-[2.75rem]" style={{ color: OB.ink }}>
          {isLive ? `Bukas na ang ${store.name}!` : `Halos bukas na ang ${store.name}`}
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed" style={{ color: OB.muted }}>{lede}</p>
      </div>

      <RetryFailedSteps token={token} view={view} onRetried={onRefresh} />

      {isLive
        ? storeUrl && <ShareLink token={token} storeUrl={storeUrl} storeName={store.name} />
        : <OpenStorePanel token={token} view={view} onLaunched={onLaunched} />}

      {choiceCount > 0 ? (
        <button type="button" onClick={onNext}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left transition-[filter] hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ob-accent,#17130F)] focus-visible:ring-offset-2"
          style={{ backgroundColor: OB.wash }}>
          <span className="text-[15px]" style={{ color: OB.muted }}>
            <b style={{ color: OB.ink }}>{choiceCount} quick {choiceCount === 1 ? 'choice' : 'choices'}</b> before your dashboard
          </span>
          <span className="inline-flex items-center gap-1 text-[15px] font-bold" style={{ color: OB.ink }}>Next <ArrowRight className="h-4 w-4" aria-hidden /></span>
        </button>
      ) : (
        <PrimaryLink href={`${store.dashboardPath}/start`} isFull>Go to my dashboard</PrimaryLink>
      )}
      <p className="text-center text-[13px]" style={{ color: OB.muted }}>Your login: <b style={{ color: OB.ink }}>{view.ownerEmail}</b></p>
    </div>
  )
}

function Done({ view, keptCombos }: { view: OnboardingView; keptCombos: number | null }) {
  const store = view.store!
  const lines = [
    keptCombos !== null ? `${keptCombos} ${keptCombos === 1 ? 'combo' : 'combos'} on your menu` : null,
    view.summary?.loyalty ? `Stamp card: ${view.summary.loyalty.threshold} orders → ${view.summary.loyalty.rewardLabel}` : null,
    view.summary?.campaigns?.drafted ? `${view.summary.campaigns.drafted} texts ready to turn on` : null,
  ].filter((line): line is string => line !== null)
  return (
    <div className="space-y-7">
      <div>
        <h1 tabIndex={-1} className="text-balance text-[2.25rem] font-extrabold leading-[1.05] tracking-[-0.03em] outline-none" style={{ color: OB.ink }}>
          You&apos;re all set
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed" style={{ color: OB.muted }}>
          Your dashboard has a short path for your first weeks: one step at a time, each with a short video.
        </p>
      </div>
      {lines.length > 0 && (
        <ul className="space-y-2.5">
          {lines.map((line) => (
            <li key={line} className="flex items-center gap-3 text-[15px] font-semibold" style={{ color: OB.ink }}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: ACCENT }} aria-hidden>
                <Check className="h-3.5 w-3.5" strokeWidth={3.5} style={{ color: ACCENT_INK }} />
              </span>
              {line}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3">
        <PrimaryLink href={`${store.dashboardPath}/start`} isFull>Start here <ArrowRight className="h-4 w-4" aria-hidden /></PrimaryLink>
        <SecondaryLink href={store.previewPath} isExternal isFull>View my store</SecondaryLink>
      </div>
    </div>
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
  const [phase, setPhase] = useState<Phase>('peak')
  const [keptCombos, setKeptCombos] = useState<number | null>(null)
  const [prefetched, setPrefetched] = useState<LaunchComboView[] | null>(null)
  const choices = choicesFor(view)
  const hasCombos = choices.includes('combos')

  // Read the combos while the owner is on the peak, so "Next" shows the first card at once.
  useEffect(() => {
    if (!hasCombos) return
    let isCancelled = false
    void fetchLaunchCombos(token).then((result) => {
      if (!isCancelled && result.ok) setPrefetched(result.data)
    })
    return () => { isCancelled = true }
  }, [token, hasCombos])

  const advanceFrom = useCallback((current: Phase) => {
    const order: Phase[] = ['peak', ...choices, 'done']
    const next = order[order.indexOf(current) + 1] ?? 'done'
    if (next === 'done') trackOnboardingEvent(token, 'choices_done')
    setPhase(next)
    window.scrollTo({ top: 0 })
  }, [choices, token])

  const handleCombosDone = useCallback((kept: number) => {
    setKeptCombos(kept)
    advanceFrom('combos')
  }, [advanceFrom])

  const store = view.store
  if (!store) return null
  const isLive = store.isLive || hasLaunched
  const eyebrowOf = (choice: ChoiceId) => `Choice ${choices.indexOf(choice) + 1} of ${choices.length}`

  return (
    <div className="lg:grid lg:grid-cols-2">
      <div className="px-5 pb-20 pt-8 sm:px-8 lg:flex lg:justify-center lg:px-12 lg:pt-14">
        <div className="mx-auto w-full max-w-[34rem]">
          {phase === 'peak' && (
            <Peak view={view} token={token} isLive={isLive} storeUrl={store.shareUrl ?? (origin ? `${origin}${store.previewPath}` : '')}
              choiceCount={choices.length} onNext={() => advanceFrom('peak')} onRefresh={onRefresh}
              onLaunched={() => { setHasLaunched(true); onRefresh() }} />
          )}
          {phase === 'combos' && (
            <ComboChoice token={token} initialCombos={prefetched} eyebrow={eyebrowOf('combos')} boostHref={`${store.dashboardPath}/boost-sales#boost-ai-log`} onDone={handleCombosDone} />
          )}
          {phase === 'stamp' && view.summary?.loyalty && (
            <StampChoice eyebrow={eyebrowOf('stamp')} loyalty={view.summary.loyalty} loyaltyHref={`${store.dashboardPath}/loyalty`} onKeep={() => advanceFrom('stamp')} />
          )}
          {phase === 'texts' && (
            <TextsChoice eyebrow={eyebrowOf('texts')} drafted={view.summary?.campaigns?.drafted ?? 0} onKeep={() => advanceFrom('texts')} />
          )}
          {phase === 'done' && <Done view={view} keptCombos={keptCombos} />}
          {phase !== 'peak' && phase !== 'done' && (
            <div className="mt-4 hidden justify-center lg:flex">
              <TextButton onClick={() => advanceFrom(phase)}>Decide later</TextButton>
            </div>
          )}
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
