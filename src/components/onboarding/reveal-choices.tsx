'use client'

import { useEffect, useState } from 'react'
import { ArrowUpRight, Gift, Loader2, MessageSquareText } from 'lucide-react'
import type { LaunchComboView } from '@/lib/onboarding/launch-offers'
import type { LaunchBuildSummary } from '@/lib/onboarding/summary'
import { LAUNCH_CAMPAIGNS } from '@/lib/onboarding/launch-campaigns'
import { decideLaunchCombo, fetchLaunchCombos } from './onboarding-api'
import { ACCENT, ACCENT_INK, ACCENT_SOFT, ErrorNote, FOCUS_RING, OB, PrimaryButton, QuestionHeading, SecondaryButton } from './onboarding-ui'

/*
 * Three quick choices after the peak (IKEA effect: we did the work, they
 * decide). Combos are the approval the owner asked for: nothing goes on the
 * menu until they tap Keep. The stamp card and the texts are already set up;
 * here they see them once and keep them, or go change them.
 */

export type ChoiceId = 'combos' | 'stamp' | 'texts'

function peso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`
}

function ChoiceFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur lg:static lg:mt-10 lg:border-0 lg:bg-transparent lg:backdrop-blur-none" style={{ borderColor: OB.line }}>
      <div className="mx-auto flex max-w-[34rem] items-center gap-2 px-5 py-3.5 sm:px-8 lg:px-0 [&>*]:flex-1">{children}</div>
    </div>
  )
}

function ComboCard({ combo, stackDepth }: { combo: LaunchComboView; stackDepth: number }) {
  return (
    <div className="relative pt-3">
      {stackDepth > 1 && <div className="absolute inset-x-6 top-0 h-6 rounded-t-2xl border-2 border-b-0" style={{ borderColor: OB.line, backgroundColor: OB.wash }} aria-hidden />}
      {stackDepth > 0 && <div className="absolute inset-x-3 top-1.5 h-6 rounded-t-2xl border-2 border-b-0" style={{ borderColor: OB.line, backgroundColor: OB.wash }} aria-hidden />}
      <article className="relative rounded-2xl border-2 bg-white p-5 [box-shadow:0_4px_0_#D3CCC4]" style={{ borderColor: OB.lineStrong }}>
        <h2 className="text-[19px] font-extrabold leading-snug" style={{ color: OB.ink }}>{combo.title}</h2>
        <ul className="mt-3 space-y-1.5">
          {combo.items.map((item) => (
            <li key={item.name} className="flex items-baseline justify-between gap-3 text-[15px]" style={{ color: OB.ink }}>
              <span className="min-w-0">{item.name}</span>
              <s className="shrink-0 text-[14px]" style={{ color: OB.faint }}>{peso(item.price)}</s>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-[28px] font-extrabold tabular-nums tracking-tight" style={{ color: OB.ink }}>{peso(combo.price)}</span>
          {combo.saves !== null && combo.saves > 0 && (
            <span className="rounded-md px-2 py-0.5 text-[12px] font-extrabold" style={{ backgroundColor: ACCENT, color: ACCENT_INK }}>SAVE {peso(combo.saves)}</span>
          )}
        </div>
        <p className="mt-3 rounded-xl px-3 py-2.5 text-[13px] leading-snug" style={{ backgroundColor: OB.wash, color: OB.muted }}>{combo.reason}</p>
      </article>
    </div>
  )
}

interface ComboChoiceProps {
  token: string
  /** Read while the owner looked at the peak, so the first card shows at once. */
  initialCombos: LaunchComboView[] | null
  eyebrow: string
  boostHref: string
  onDone: (keptCount: number) => void
}

export function ComboChoice({ token, initialCombos, eyebrow, boostHref, onDone }: ComboChoiceProps) {
  const [combos, setCombos] = useState<LaunchComboView[] | null>(initialCombos)
  const [busy, setBusy] = useState<'keep' | 'skip' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (initialCombos) return
    let isCancelled = false
    void fetchLaunchCombos(token)
      .catch(() => ({ ok: false as const, error: 'We could not load your combos. Check your connection and try again.' }))
      .then((result) => {
        if (isCancelled) return
        if (result.ok) setCombos(result.data)
        else setError(result.error)
      })
    return () => { isCancelled = true }
  }, [token, initialCombos, attempt])

  function retryLoad() {
    setError(null)
    setAttempt((count) => count + 1)
  }

  const waiting = (combos ?? []).filter((combo) => combo.status === 'waiting')
  const kept = (combos ?? []).filter((combo) => combo.status === 'kept').length
  const current = waiting[0] ?? null

  // Nothing (left) to decide: move on by itself.
  useEffect(() => {
    if (combos && !current) onDone(kept)
  }, [combos, current, kept, onDone])

  async function decide(decision: 'keep' | 'skip') {
    if (!current) return
    setBusy(decision)
    setError(null)
    const result = await decideLaunchCombo(token, current.id, decision)
    setBusy(null)
    if (!result.ok) return setError(result.error)
    if (result.data.outcome === 'needs-edit') setError('This one needs a small edit first. Tap Edit to finish it in Boost Sales.')
    setCombos(result.data.combos)
  }

  if (!combos && error) {
    // A failed read must never strand a phone owner on a spinner: offer a retry and a way past the step.
    return (
      <div className="space-y-4 py-6" role="alert">
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-3">
          <SecondaryButton onClick={() => onDone(0)}>Skip for now</SecondaryButton>
          <PrimaryButton onClick={retryLoad}>Try again</PrimaryButton>
        </div>
      </div>
    )
  }
  if (!combos) {
    return (
      <div className="flex items-center gap-3 py-10" role="status">
        <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" style={{ color: OB.ink }} aria-hidden />
        <span className="text-[15px]" style={{ color: OB.muted }}>Getting your combos…</span>
      </div>
    )
  }
  if (!current) return null

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <QuestionHeading eyebrow={eyebrow} title="Keep this combo?" lede="We built it from your menu. It goes on your menu only if you keep it." />
      <ComboCard key={current.id} combo={current} stackDepth={waiting.length - 1} />
      <p className="text-center text-[13px]" style={{ color: OB.muted }}>
        {waiting.length === 1 ? 'Last combo to review' : `${waiting.length} combos to review`} · you can change them anytime
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <ChoiceFooter>
        <SecondaryButton onClick={() => decide('skip')} isDisabled={busy !== null}>
          {busy === 'skip' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Skip
        </SecondaryButton>
        <a href={boostHref} target="_blank" rel="noopener noreferrer"
          className={`inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border bg-white px-4 text-[15px] font-semibold hover:bg-[#F6F4F1] ${FOCUS_RING}`}
          style={{ borderColor: OB.lineStrong, color: OB.ink }}>
          Edit <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
        <PrimaryButton onClick={() => decide('keep')} isDisabled={busy !== null}>
          {busy === 'keep' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Keep
        </PrimaryButton>
      </ChoiceFooter>
    </div>
  )
}

const STAMP_SLOTS_SHOWN = 8

interface StampChoiceProps {
  eyebrow: string
  loyalty: NonNullable<LaunchBuildSummary['loyalty']>
  loyaltyHref: string
  onKeep: () => void
}

export function StampChoice({ eyebrow, loyalty, loyaltyHref, onKeep }: StampChoiceProps) {
  const slots = Math.min(loyalty.threshold, STAMP_SLOTS_SHOWN)
  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <QuestionHeading eyebrow={eyebrow} title="Your stamp card is ready" lede="Customers collect a stamp with every order. It is already on, so your first customers start collecting." />
      <div className="rounded-2xl border-2 p-5 [box-shadow:0_4px_0_#D3CCC4]" style={{ borderColor: OB.lineStrong, backgroundColor: ACCENT_SOFT }}>
        <p className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: OB.muted }}>Reward</p>
        <p className="mt-1 text-[22px] font-extrabold leading-tight" style={{ color: OB.ink }}>{loyalty.rewardLabel}</p>
        <div className="mt-4 grid grid-cols-8 gap-1.5" aria-label={`${loyalty.threshold} stamps`}>
          {Array.from({ length: slots }, (_, index) => (
            <span key={index} className="flex aspect-square items-center justify-center rounded-full border-2" style={{ borderColor: ACCENT, backgroundColor: index === slots - 1 ? ACCENT : 'transparent' }}>
              {index === slots - 1 && <Gift className="h-1/2 w-1/2" strokeWidth={2.25} style={{ color: ACCENT_INK }} aria-hidden />}
            </span>
          ))}
        </div>
        <p className="mt-4 text-[14px] leading-snug" style={{ color: OB.muted }}>
          {loyalty.threshold} orders, then it&apos;s free.
          {loyalty.minSpend ? ` Orders of ${peso(loyalty.minSpend)} or more earn a stamp.` : ''}
        </p>
      </div>
      <ChoiceFooter>
        <a href={loyaltyHref} target="_blank" rel="noopener noreferrer"
          className={`inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border bg-white px-4 text-[15px] font-semibold hover:bg-[#F6F4F1] ${FOCUS_RING}`}
          style={{ borderColor: OB.lineStrong, color: OB.ink }}>
          Change reward <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
        <PrimaryButton onClick={onKeep}>Keep it</PrimaryButton>
      </ChoiceFooter>
    </div>
  )
}

export function TextsChoice({ eyebrow, drafted, onKeep }: { eyebrow: string; drafted: number; onKeep: () => void }) {
  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <QuestionHeading
        eyebrow={eyebrow}
        title={`${drafted} text messages, ready to go`}
        lede="They bring customers back. They are saved as drafts, so nothing is sent until you turn one on in the SmartMenu app on an Android phone."
      />
      <ul className="divide-y rounded-2xl border-2" style={{ borderColor: OB.line }}>
        {LAUNCH_CAMPAIGNS.slice(0, drafted).map((text) => (
          <li key={text.name} className="flex items-center gap-3.5 px-4 py-3.5" style={{ borderColor: OB.line }}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: OB.wash, color: OB.muted }} aria-hidden>
              <MessageSquareText className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold" style={{ color: OB.ink }}>{text.name}</span>
              <span className="block text-[13px]" style={{ color: OB.muted }}>{text.when}</span>
            </span>
          </li>
        ))}
      </ul>
      <ChoiceFooter>
        <PrimaryButton onClick={onKeep}>Keep them</PrimaryButton>
      </ChoiceFooter>
    </div>
  )
}
