import Link from 'next/link'
import { ArrowRight, Check, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GOALS } from '@/lib/onboarding/goals'
import type { PathStep } from '@/lib/onboarding/start-path'
import { TickButton } from './tick-button'

export interface LessonChip {
  slug: string
  title: string
  minutes: number | null
  href: string
}

interface PathStepRowProps {
  step: PathStep
  position: number
  lessons: LessonChip[]
  tenantId: string
  tenantSlug: string
}

/** A video link that reads as "this is how", next to the step it explains. */
function LessonLink({ lesson }: { lesson: LessonChip }) {
  return (
    <Link
      href={lesson.href}
      className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full bg-wn-ink py-1 pl-1 pr-3 text-[12px] font-bold text-white transition-colors hover:bg-wn-ink-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-coral focus-visible:ring-offset-2"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E8B23A] text-wn-ink" aria-hidden>
        <Play className="h-3.5 w-3.5 translate-x-px fill-current" />
      </span>
      <span className="truncate">{lesson.title}</span>
      {lesson.minutes ? <span className="shrink-0 font-semibold text-white/60">{lesson.minutes} min</span> : null}
    </Link>
  )
}

/**
 * One node on the path. Done: a filled check, quiet. Current: the coral card
 * with its one action. Upcoming: open, never locked (an owner may go ahead).
 */
export function PathStepRow({ step, position, lessons, tenantId, tenantSlug }: PathStepRowProps) {
  const isDone = step.state === 'done'
  const isCurrent = step.state === 'current'
  return (
    <li
      className={cn(
        'flex gap-3.5 rounded-2xl border-2 p-3.5 sm:p-4',
        isCurrent ? 'border-wn-coral bg-wn-coral-wash [box-shadow:0_4px_0_var(--color-wn-coral)]' : 'border-wn-line bg-white',
        isDone && 'bg-wn-sand/60',
      )}
      aria-current={isCurrent ? 'step' : undefined}
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold tabular-nums',
          isDone && 'bg-wn-ink text-white',
          isCurrent && 'border-[2.5px] border-wn-coral bg-white text-wn-coral-deep',
          !isDone && !isCurrent && 'border-2 border-wn-line bg-white text-wn-stone',
        )}
        aria-hidden
      >
        {isDone ? <Check className="h-4 w-4" strokeWidth={3} /> : position}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-[15px] font-extrabold leading-snug', isDone ? 'text-wn-stone' : 'text-wn-ink')}>
          {step.title}
          <span className="sr-only">{isDone ? ' (done)' : isCurrent ? ' (your next step)' : ''}</span>
        </p>
        {!isDone && <p className="mt-0.5 text-[13px] leading-snug text-wn-stone">{step.detail}</p>}
        {!isDone && step.goal && (
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.07em] text-wn-stone/80">For {GOALS[step.goal].title.toLowerCase()}</p>
        )}
        {!isDone && (step.action || step.canTick || lessons.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {step.action && (
              <Link
                href={step.action.href}
                className={cn(
                  'inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-bold transition-[transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-coral focus-visible:ring-offset-2',
                  isCurrent
                    ? 'bg-wn-coral text-white [box-shadow:0_3px_0_var(--color-wn-coral-deep)] active:translate-y-[2px] active:[box-shadow:0_1px_0_var(--color-wn-coral-deep)]'
                    : 'border-2 border-wn-line bg-white text-wn-ink hover:bg-wn-sand',
                )}
              >
                {step.action.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
            {step.canTick && <TickButton tenantId={tenantId} tenantSlug={tenantSlug} stepId={step.id} />}
            {lessons.map((lesson) => <LessonLink key={lesson.slug} lesson={lesson} />)}
          </div>
        )}
      </div>
    </li>
  )
}
