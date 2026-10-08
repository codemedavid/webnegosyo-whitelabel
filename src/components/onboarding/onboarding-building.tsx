'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Check, CreditCard, Gift, GraduationCap, Loader2, MinusCircle, Palette, PlayCircle, X, Zap } from 'lucide-react'
import type { OnboardingBuildStepId, StepStatus } from '@/lib/onboarding/plan'
import type { OnboardingView } from '@/lib/onboarding/view'
import { ACCENT, ACCENT_SOFT, Card, DISPLAY_FONT, Eyebrow, ONBOARDING_COLORS } from './onboarding-ui'
import { LiveStoreFrame, PhoneFrame } from './store-preview-phone'

/**
 * The wait while the store is built, made worth watching: each step ticks off
 * with what it did, the real storefront fills in inside the phone, and the
 * first University lessons are right there to start on.
 */

const STEP_ICONS: Record<OnboardingBuildStepId, typeof Palette> = {
  branding: Palette,
  menu: BookOpen,
  store_setup: CreditCard,
  boost: Zap,
  loyalty: Gift,
}

const RUNNING_LINES: Record<OnboardingBuildStepId, string[]> = {
  branding: ['Mixing your colors…', 'Choosing fonts that fit…', 'Painting every page…'],
  menu: ['Reading every line of your menu…', 'Typing dishes and prices…', 'Sorting them into categories…', 'Almost done reading…'],
  store_setup: ['Adding your ways to pay…', 'Setting your opening hours…'],
  boost: ['Pairing your best sellers…', 'Building combo deals…', 'Adding upsells…'],
  loyalty: ['Printing your loyalty stamp card…'],
}

const LINE_INTERVAL_MS = 2600
const MAX_WAIT_LESSONS = 3

function useRotatingLine(lines: string[], isActive: boolean): string {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!isActive) return
    setIndex(0)
    const timer = setInterval(() => setIndex((current) => (current + 1) % lines.length), LINE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isActive, lines])
  return lines[index] ?? lines[0] ?? ''
}

function StatusBadge({ status, icon: Icon }: { status: StepStatus; icon: typeof Palette }) {
  if (status === 'done') return <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-white"><Check className="h-5 w-5" aria-hidden /></span>
  if (status === 'failed') return <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-100 text-red-700"><X className="h-5 w-5" aria-hidden /></span>
  if (status === 'skipped') return <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black/5 text-black/40"><MinusCircle className="h-5 w-5" aria-hidden /></span>
  if (status === 'running') {
    return (
      <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: ACCENT_SOFT }}>
        <span className="absolute inset-0 animate-ping rounded-2xl opacity-30" style={{ backgroundColor: ACCENT }} aria-hidden />
        <Icon className="relative h-5 w-5" style={{ color: ACCENT }} aria-hidden />
      </span>
    )
  }
  return <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black/[0.04] text-black/25"><Icon className="h-5 w-5" aria-hidden /></span>
}

function BuildStepRow({ step }: { step: OnboardingView['steps'][number] }) {
  const isRunning = step.status === 'running'
  const line = useRotatingLine(RUNNING_LINES[step.id], isRunning)
  const detail = isRunning ? line : step.detail
  return (
    <li className="flex items-center gap-4 py-3">
      <StatusBadge status={step.status} icon={STEP_ICONS[step.id]} />
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] font-bold ${step.status === 'pending' ? 'opacity-40' : ''}`} style={{ color: ONBOARDING_COLORS.ink }}>{step.label}</p>
        {detail && (
          <p className="truncate text-xs" aria-live={isRunning ? 'polite' : undefined} style={{ color: step.status === 'failed' ? '#B91C1C' : ONBOARDING_COLORS.cocoa }}>
            {detail}
          </p>
        )}
      </div>
      {isRunning && <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: ACCENT }} aria-hidden />}
    </li>
  )
}

function WaitingPhone() {
  return (
    <PhoneFrame label="Your store is being designed">
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-white to-[#FBF6ED] p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: ACCENT }} aria-hidden />
        <p className="text-sm font-bold" style={{ color: ONBOARDING_COLORS.ink }}>Designing your store…</p>
        <p className="text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>It appears here the moment your colors are on.</p>
      </div>
    </PhoneFrame>
  )
}

function WhileYouWait({ view }: { view: OnboardingView }) {
  const plan = view.firstWeek
  if (!plan) return null
  const lessons = plan.steps.flatMap((step) => step.lessons).slice(0, MAX_WAIT_LESSONS)
  return (
    <Card>
      <div className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5" style={{ color: ACCENT }} aria-hidden />
        <p className="text-sm font-bold" style={{ color: ONBOARDING_COLORS.ink }}>While you wait — SmartMenu University</p>
      </div>
      <p className="mt-1 text-xs" style={{ color: ONBOARDING_COLORS.cocoa }}>Short videos on running your store. They open in a new tab — your build keeps going.</p>
      <ul className="mt-3 space-y-2">
        {lessons.map((lesson) => (
          <li key={lesson.href}>
            <a href={lesson.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-black/[0.03]">
              <PlayCircle className="h-5 w-5 shrink-0" style={{ color: ACCENT }} aria-hidden />
              <span className="text-sm font-semibold" style={{ color: ONBOARDING_COLORS.ink }}>{lesson.title}</span>
            </a>
          </li>
        ))}
      </ul>
      <a href={plan.courseHref} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-bold" style={{ color: ACCENT }}>
        See every lesson →
      </a>
    </Card>
  )
}

export function OnboardingBuilding({ view }: { view: OnboardingView }) {
  const settled = view.steps.filter((step) => step.status === 'done' || step.status === 'skipped').length
  const percent = Math.round((settled / view.steps.length) * 100)
  const isBrandingDone = view.steps.find((step) => step.id === 'branding')?.status === 'done'

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
      <div className="min-w-0 space-y-7">
        <div>
          <Eyebrow>Building · {percent}%</Eyebrow>
          <h1 className="mt-1.5 text-[2rem] font-extrabold leading-tight tracking-tight" style={{ color: ONBOARDING_COLORS.ink, fontFamily: DISPLAY_FONT }}>
            Building {view.store?.name ?? 'your store'}…
          </h1>
          <p className="mt-1 text-[15px]" style={{ color: ONBOARDING_COLORS.cocoa }}>
            About a minute or two. You can keep this page open — or come back to this same link anytime.
          </p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.max(percent, 6)}%`, backgroundColor: ACCENT }} />
          </div>
        </div>

        <Card className="py-2">
          <ol className="divide-y divide-black/5">
            {view.steps.map((step) => <BuildStepRow key={step.id} step={step} />)}
          </ol>
        </Card>

        <WhileYouWait view={view} />
      </div>

      <aside aria-label="Your store">
        <div className="lg:sticky lg:top-8">
          {view.store && isBrandingDone
            ? <LiveStoreFrame path={view.store.previewPath} title={`${view.store.name} storefront`} version={settled} />
            : <WaitingPhone />}
        </div>
      </aside>
    </div>
  )
}
