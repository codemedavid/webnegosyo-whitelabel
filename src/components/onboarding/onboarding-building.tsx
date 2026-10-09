'use client'

import { Check, Minus, Play, X } from 'lucide-react'
import type { OnboardingBuildStepId, StepStatus } from '@/lib/onboarding/plan'
import { GOALS, type GoalId } from '@/lib/onboarding/goals'
import type { OnboardingView } from '@/lib/onboarding/view'
import { ACCENT, ACCENT_INK, ACCENT_SOFT, OB } from './onboarding-ui'
import { LiveStoreFrame, PhoneFrame, PhoneSkeleton, StorePreviewPhone, type StorePreviewProps } from './store-preview-phone'

/**
 * The wait while the store is built: the step really running (never a
 * made-up activity line), the steps ticking off with what each one found,
 * the steps that serve the owner's goals saying so, the real storefront
 * filling in inside the phone, and the first lesson to watch meanwhile.
 */

/** A build step that serves one of the owner's goals says so: their words, quoted back. */
const STEP_GOALS: Partial<Record<OnboardingBuildStepId, GoalId>> = {
  boost: 'bigger_orders',
  loyalty: 'regulars',
  campaigns: 'regulars',
}

function statusLine(view: OnboardingView, isOpening: boolean): string {
  if (isOpening) return 'Opening your store for orders'
  // Between two steps nothing is "running" for a moment: name the next one, not "getting started".
  const current = view.steps.find((step) => step.status === 'running') ?? view.steps.find((step) => step.status === 'pending')
  return current ? current.label : 'Finishing up'
}

function StepMark({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full animate-in zoom-in-50 duration-300" style={{ backgroundColor: ACCENT }}>
        <Check className="h-4 w-4" strokeWidth={3} style={{ color: ACCENT_INK }} aria-hidden />
      </span>
    )
  }
  if (status === 'failed') {
    return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100"><X className="h-4 w-4 text-red-700" strokeWidth={2.5} aria-hidden /></span>
  }
  if (status === 'skipped') {
    return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: OB.wash }}><Minus className="h-4 w-4" style={{ color: OB.faint }} aria-hidden /></span>
  }
  if (status === 'running') {
    return (
      <span className="relative h-7 w-7 shrink-0" aria-hidden>
        <span className="absolute inset-0 rounded-full border-2" style={{ borderColor: OB.line }} />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent motion-reduce:animate-none" style={{ borderTopColor: ACCENT }} />
      </span>
    )
  }
  return <span className="h-7 w-7 shrink-0 rounded-full border-2" style={{ borderColor: OB.line }} aria-hidden />
}

const STATUS_WORDS: Record<StepStatus, string> = {
  done: 'done', failed: 'needs a retry', skipped: 'skipped', running: 'in progress', pending: 'waiting',
}

function BuildStepRow({ step, goals }: { step: OnboardingView['steps'][number]; goals: readonly GoalId[] }) {
  const isQuiet = step.status === 'pending'
  const goal = STEP_GOALS[step.id]
  const isForGoal = !!goal && goals.includes(goal)
  return (
    <li className="flex items-start gap-4 py-3">
      <StepMark status={step.status} />
      <div className="min-w-0 pt-0.5">
        <p className="text-[15px] font-semibold transition-colors" style={{ color: isQuiet ? OB.faint : OB.ink }}>
          {step.label}
          <span className="sr-only">, {STATUS_WORDS[step.status]}</span>
        </p>
        {isForGoal && goal && (
          <p className="mt-0.5 text-[11.5px] font-bold uppercase tracking-[0.07em]" style={{ color: OB.faint }}>For {GOALS[goal].title.toLowerCase()}</p>
        )}
        {step.detail && step.status !== 'running' && step.status !== 'pending' && (
          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: step.status === 'failed' ? '#B91C1C' : OB.muted }}>{step.detail}</p>
        )}
      </div>
    </li>
  )
}

/** The wait becomes lesson one: the first video of their path, not a spinner. */
function WhileYouWait({ title, href }: { title: string; href: string }) {
  return (
    <div className="mt-8">
      <p className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: OB.faint }}>While you wait</p>
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="mt-2.5 flex items-center gap-4 rounded-2xl bg-[#1B1815] p-4 text-white transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8B23A] focus-visible:ring-offset-2 motion-reduce:transition-none">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8B23A] text-[#1B1815]" aria-hidden>
          <Play className="h-5 w-5 translate-x-px fill-current" />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold leading-snug">{title}</span>
          <span className="mt-0.5 block text-[13px] text-white/70">A short video. Opens in a new tab.</span>
        </span>
      </a>
    </div>
  )
}

function WaitingPhone() {
  return (
    <PhoneFrame label="Your store is being designed">
      <PhoneSkeleton />
    </PhoneFrame>
  )
}

export function OnboardingBuilding({ view, isOpening = false, preview = null }: { view: OnboardingView; isOpening?: boolean; preview?: StorePreviewProps | null }) {
  const settled = view.steps.filter((step) => step.status === 'done' || step.status === 'skipped').length
  const line = statusLine(view, isOpening)
  const isBrandingDone = view.steps.find((step) => step.id === 'branding')?.status === 'done'
  const storeName = view.store?.name ?? view.businessName ?? 'your store'
  const firstLesson = view.firstWeek?.steps.flatMap((step) => step.lessons)[0] ?? null

  return (
    <div className="lg:grid lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-2">
      <div className="px-5 pb-16 pt-8 sm:px-8 lg:flex lg:justify-center lg:px-12 lg:pt-16">
        <div className="mx-auto w-full max-w-[34rem]">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: OB.faint }}>Go live</p>
          <h1 className="mt-2 text-balance text-[2.25rem] font-extrabold leading-[1.06] tracking-[-0.03em] sm:text-[3rem]" style={{ color: OB.ink }}>
            Building {storeName}
          </h1>
          <p className="mt-4 flex items-center gap-2 text-[17px]" style={{ color: OB.muted }} aria-live="polite">
            <span key={line} className="animate-in fade-in slide-in-from-bottom-1 duration-500">{line}…</span>
          </p>

          <div className="mt-8 h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: OB.line }}
            role="progressbar" aria-label="Build progress" aria-valuemin={0} aria-valuemax={view.steps.length} aria-valuenow={settled}>
            <div className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max((settled / view.steps.length) * 100, 4)}%`, backgroundColor: ACCENT }} />
          </div>

          <ol className="mt-6">
            {view.steps.map((step) => <BuildStepRow key={step.id} step={step} goals={view.goals} />)}
          </ol>

          <p className="mt-6 text-[13px] leading-relaxed" style={{ color: OB.muted }}>
            A minute or two. You can close this page and come back to the same link anytime.
          </p>
          {firstLesson && <WhileYouWait title={firstLesson.title} href={firstLesson.href} />}
        </div>
      </div>

      <aside className="px-5 pb-12 lg:p-4" aria-label="Your store">
        <div className="flex flex-col items-center justify-center rounded-3xl px-6 py-10 transition-colors duration-700 lg:sticky lg:top-4 lg:h-[calc(100dvh-6rem)]" style={{ backgroundColor: ACCENT_SOFT }}>
          <div className="w-full max-w-[290px]">
            {view.store && isBrandingDone
              ? <LiveStoreFrame path={view.store.previewPath} title={`${storeName} storefront`} version={settled} />
              : preview ? <StorePreviewPhone {...preview} /> : <WaitingPhone />}
          </div>
        </div>
      </aside>
    </div>
  )
}
