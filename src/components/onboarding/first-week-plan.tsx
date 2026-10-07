'use client'

import { useCallback, useEffect, useState } from 'react'
import { Apple, Check, GraduationCap, PlayCircle, Smartphone } from 'lucide-react'
import type { AppDownloadLink, FirstWeekPlan as FirstWeekPlanData, FirstWeekStep, FirstWeekStepId } from '@/lib/onboarding/first-week'

/**
 * The merchant's first week after set-up: app downloads, then a short list of
 * steps, each with the University lesson that teaches it. Ticks are a
 * per-browser convenience (no account state), so a cleared browser simply
 * shows the list unticked again.
 */

const STORAGE_PREFIX = 'webnegosyo-first-week:'

function readTicked(storeSlug: string): FirstWeekStepId[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_PREFIX + storeSlug) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((value): value is FirstWeekStepId => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeTicked(storeSlug: string, ids: FirstWeekStepId[]): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + storeSlug, JSON.stringify(ids))
  } catch {
    // Private mode or a full quota: ticks are simply not remembered.
  }
}

function useTicks(storeSlug: string) {
  const [ticked, setTicked] = useState<FirstWeekStepId[]>([])
  useEffect(() => setTicked(readTicked(storeSlug)), [storeSlug])
  const toggle = useCallback((id: FirstWeekStepId) => {
    setTicked((prev) => {
      const next = prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
      writeTicked(storeSlug, next)
      return next
    })
  }, [storeSlug])
  return { ticked, toggle }
}

function DownloadButton({ download }: { download: AppDownloadLink }) {
  const Icon = download.platform === 'ios' ? Apple : Smartphone
  return (
    <div className="min-w-0 flex-1">
      <a
        href={download.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-800"
      >
        <Icon className="h-4 w-4" aria-hidden />
        {download.label}
      </a>
      {download.note && <p className="mt-1 text-center text-[11px] text-neutral-500">{download.note}</p>}
    </div>
  )
}

function StepRow({ step, index, isTicked, onToggle }: { step: FirstWeekStep; index: number; isTicked: boolean; onToggle: () => void }) {
  return (
    <li className="flex gap-3 p-4">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isTicked}
        aria-label={isTicked ? `Mark "${step.title}" as not done` : `Mark "${step.title}" as done`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
          isTicked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-neutral-300 bg-white text-neutral-500'
        }`}
      >
        {isTicked ? <Check className="h-4 w-4" aria-hidden /> : index + 1}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${isTicked ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
          {step.title}
          {step.isOptional && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700">Optional</span>}
        </p>
        <p className="mt-0.5 text-xs text-neutral-600">{step.why}</p>
        {(step.lessons.length > 0 || step.action) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {step.lessons.map((lesson) => (
              <a
                key={lesson.href}
                href={lesson.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100"
              >
                <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                {lesson.title}
              </a>
            ))}
            {step.action && (
              <a
                href={step.action.href}
                className="inline-flex min-h-9 items-center rounded-full bg-white px-3 text-xs font-semibold text-neutral-800 ring-1 ring-neutral-300 transition hover:bg-neutral-50"
              >
                {step.action.label} →
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

export function FirstWeekPlan({ plan, storeSlug, ownerEmail }: { plan: FirstWeekPlanData; storeSlug: string; ownerEmail?: string }) {
  const { ticked, toggle } = useTicks(storeSlug)
  const doneCount = plan.steps.filter((step) => ticked.includes(step.id)).length

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white" aria-labelledby="first-week-heading">
      <div className="border-b border-neutral-200 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="first-week-heading" className="text-base font-bold text-neutral-900">Your first week</h2>
          <span className="text-xs font-semibold tabular-nums text-neutral-500">{doneCount}/{plan.steps.length} done</span>
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          Start with the app: it is where orders ring{ownerEmail ? <> — log in with <span className="font-semibold">{ownerEmail}</span></> : null}.
        </p>
        {plan.appDownloads.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {plan.appDownloads.map((download) => <DownloadButton key={download.platform} download={download} />)}
          </div>
        )}
      </div>

      <ol className="divide-y divide-neutral-100">
        {plan.steps.map((step, index) => (
          <StepRow key={step.id} step={step} index={index} isTicked={ticked.includes(step.id)} onToggle={() => toggle(step.id)} />
        ))}
      </ol>

      <a
        href={plan.courseHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 border-t border-neutral-200 bg-neutral-50 p-4 transition hover:bg-neutral-100"
      >
        <GraduationCap className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-neutral-900">SmartMenu University</span>
          <span className="block text-xs text-neutral-600">
            {plan.courseLessonCount ? `The full Getting Started course: ${plan.courseLessonCount} short video lessons, free.` : 'Free video lessons on running your store.'}
          </span>
        </span>
        <span className="text-sm font-semibold text-amber-800">Watch →</span>
      </a>
    </section>
  )
}
