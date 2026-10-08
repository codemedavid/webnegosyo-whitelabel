'use client'

import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowUpRight, Check, ChevronDown, PlayCircle } from 'lucide-react'
import type { AppDownloadLink, FirstWeekPlan as FirstWeekPlanData, FirstWeekStep, FirstWeekStepId } from '@/lib/onboarding/first-week'

/**
 * The merchant's first week, as a setup guide: one step open at a time, each
 * with what to do and the short lesson that shows how. Ticks are a per-browser
 * convenience (no account state), so a cleared browser shows the list unticked.
 * Used on the set-up page and the admin Launch page, so it carries its own
 * neutrals and reads the accent only when a parent sets one.
 */

const STORAGE_PREFIX = 'webnegosyo-first-week:'

const INK = '#17130F'
const MUTED = '#5C544D'
const LINE = '#E9E5E0'
const ACCENT = 'var(--ob-accent, #17130F)'
const ACCENT_INK = 'var(--ob-accent-ink, #FFFFFF)'
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ob-accent,#17130F)] focus-visible:ring-offset-2'

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

/** The Apple mark, for the App Store badge (lucide's apple is the fruit). */
function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="currentColor" aria-hidden>
      <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.32-3.5zM14.2 6.13c.6-.74 1.01-1.75.9-2.77-.87.04-1.94.59-2.56 1.32-.56.64-1.05 1.68-.92 2.67.97.08 1.97-.49 2.58-1.22z" />
    </svg>
  )
}

/** The Android robot head, for the direct-download badge. */
function AndroidMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="currentColor" aria-hidden>
      <path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22A11.4 11.4 0 0 0 12 8.13c-1.77 0-3.43.38-4.92 1.01L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48C3.3 11.17 1.18 14.3.9 18h22.2c-.28-3.7-2.4-6.83-5.5-8.52zM7 15.25a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm10 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
    </svg>
  )
}

/** Store-badge-shaped download buttons: the shape owners already trust. */
function StoreBadge({ download }: { download: AppDownloadLink }) {
  const isIos = download.platform === 'ios'
  return (
    <a href={download.href} target="_blank" rel="noopener noreferrer"
      className={`inline-flex h-14 min-w-[10.5rem] items-center gap-3 rounded-xl bg-[#111] px-4 text-white transition-colors hover:bg-black ${FOCUS_RING}`}>
      {isIos ? <AppleMark /> : <AndroidMark />}
      <span className="text-left leading-tight">
        <span className="block text-[11px] opacity-80">{isIos ? 'Download on the' : 'Download for'}</span>
        <span className="block text-[17px] font-semibold tracking-[-0.01em]">{isIos ? 'App Store' : 'Android'}</span>
      </span>
    </a>
  )
}

function AppDownloads({ plan, ownerEmail }: { plan: FirstWeekPlanData; ownerEmail?: string }) {
  const downloadPage = downloadPageUrl(plan.courseHref)
  const notes = plan.appDownloads.map((download) => download.note).filter(Boolean)
  return (
    <div className="flex items-center gap-6">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap gap-2">
          {plan.appDownloads.map((download) => <StoreBadge key={download.platform} download={download} />)}
        </div>
        {ownerEmail && <p className="text-[13px]" style={{ color: MUTED }}>Log in with <b style={{ color: INK }}>{ownerEmail}</b>.</p>}
        {notes.map((note) => <p key={note} className="text-[13px]" style={{ color: MUTED }}>{note}</p>)}
      </div>
      {downloadPage && (
        <div className="hidden shrink-0 text-center sm:block">
          <div className="rounded-xl border bg-white p-2" style={{ borderColor: LINE }}>
            <QRCodeSVG value={downloadPage} size={96} marginSize={0} level="M" title="Scan to get the app" />
          </div>
          <p className="mt-1.5 text-[11px] font-medium" style={{ color: MUTED }}>Scan with your phone</p>
        </div>
      )}
    </div>
  )
}

/** The platform's /download page, on the same host as the University. */
function downloadPageUrl(courseHref: string): string | null {
  try {
    return `${new URL(courseHref).origin}/download`
  } catch {
    return null
  }
}

interface StepRowProps {
  step: FirstWeekStep
  isTicked: boolean
  isOpen: boolean
  onToggleTick: () => void
  onToggleOpen: () => void
  children?: React.ReactNode
}

function StepRow({ step, isTicked, isOpen, onToggleTick, onToggleOpen, children }: StepRowProps) {
  const panelId = `first-week-${step.id}`
  return (
    <li className="border-t" style={{ borderColor: LINE }}>
      <div className="flex items-center gap-3 px-4 sm:px-5">
        <button
          type="button"
          onClick={onToggleTick}
          aria-pressed={isTicked}
          aria-label={isTicked ? `Mark "${step.title}" as not done` : `Mark "${step.title}" as done`}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed transition-colors ${FOCUS_RING}`}
          style={isTicked ? { backgroundColor: ACCENT, borderColor: ACCENT, borderStyle: 'solid' } : { borderColor: '#A9A098' }}
        >
          {isTicked && <Check className="h-3.5 w-3.5" strokeWidth={3} style={{ color: ACCENT_INK }} aria-hidden />}
        </button>
        <button type="button" onClick={onToggleOpen} aria-expanded={isOpen} aria-controls={panelId}
          className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg text-left ${FOCUS_RING}`}>
          <span className={`min-w-0 flex-1 text-[15px] font-semibold ${isTicked ? 'line-through decoration-1' : ''}`} style={{ color: isTicked ? MUTED : INK }}>
            {step.title}
            {step.isOptional && <span className="ml-2 text-[13px] font-normal no-underline" style={{ color: MUTED }}>Optional</span>}
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} style={{ color: MUTED }} aria-hidden />
        </button>
      </div>
      {isOpen && (
        <div id={panelId} className="space-y-4 px-4 pb-5 pl-[3.25rem] animate-in fade-in slide-in-from-top-1 duration-200 sm:px-5 sm:pl-14">
          <p className="max-w-[34rem] text-[15px] leading-relaxed" style={{ color: MUTED }}>{step.why}</p>
          {children}
          {(step.action || step.lessons.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {step.action && (
                <a href={step.action.href}
                  className={`inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold transition-[filter] hover:brightness-110 ${FOCUS_RING}`}
                  style={{ backgroundColor: ACCENT, color: ACCENT_INK }}>
                  {step.action.label}
                </a>
              )}
              {step.lessons.map((lesson) => (
                <a key={lesson.href} href={lesson.href} target="_blank" rel="noopener noreferrer"
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold underline decoration-1 underline-offset-4 ${FOCUS_RING}`}
                  style={{ color: INK }}>
                  <PlayCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  Watch: {lesson.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export function FirstWeekPlan({ plan, storeSlug, ownerEmail }: { plan: FirstWeekPlanData; storeSlug: string; ownerEmail?: string }) {
  const { ticked, toggle } = useTicks(storeSlug)
  const [openId, setOpenId] = useState<FirstWeekStepId | null>(null)
  const doneCount = plan.steps.filter((step) => ticked.includes(step.id)).length
  // Until the owner picks one, the first unfinished step is the one open.
  const activeId = openId ?? plan.steps.find((step) => !ticked.includes(step.id))?.id ?? null

  function tick(id: FirstWeekStepId) {
    const isTicking = !ticked.includes(id)
    toggle(id)
    // Finishing the open step moves on to the next unfinished one.
    if (isTicking && activeId === id) {
      setOpenId(plan.steps.find((step) => step.id !== id && !ticked.includes(step.id))?.id ?? null)
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: LINE }} aria-labelledby="first-week-heading">
      <div className="px-4 pb-4 pt-5 sm:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="first-week-heading" className="text-[17px] font-bold" style={{ color: INK }}>Your first week</h2>
          <span className="text-[13px] font-medium tabular-nums" style={{ color: MUTED }}>{doneCount} of {plan.steps.length} done</span>
        </div>
        <p className="mt-1 text-[15px]" style={{ color: MUTED }}>{plan.steps.length} short steps to your first busy day.</p>
        <div className="mt-4 flex gap-1" aria-hidden>
          {plan.steps.map((step) => (
            <span key={step.id} className="h-1 flex-1 rounded-full transition-colors duration-300" style={{ backgroundColor: ticked.includes(step.id) ? ACCENT : LINE }} />
          ))}
        </div>
      </div>

      <ul>
        {plan.steps.map((step) => (
          <StepRow
            key={step.id}
            step={step}
            isTicked={ticked.includes(step.id)}
            isOpen={activeId === step.id}
            onToggleTick={() => tick(step.id)}
            onToggleOpen={() => setOpenId(activeId === step.id ? null : step.id)}
          >
            {step.id === 'app' && plan.appDownloads.length > 0 && <AppDownloads plan={plan} ownerEmail={ownerEmail} />}
          </StepRow>
        ))}
      </ul>

      <a href={plan.courseHref} target="_blank" rel="noopener noreferrer"
        className={`flex items-center gap-3 border-t px-4 py-4 transition-colors hover:bg-[#F6F4F1] sm:px-5 ${FOCUS_RING}`} style={{ borderColor: LINE }}>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold" style={{ color: INK }}>SmartMenu University</span>
          <span className="block text-[13px]" style={{ color: MUTED }}>
            {plan.courseLessonCount ? `${plan.courseLessonCount} short video lessons on running your store. Free.` : 'Free video lessons on running your store.'}
          </span>
        </span>
        <ArrowUpRight className="h-5 w-5 shrink-0" style={{ color: INK }} aria-hidden />
      </a>
    </section>
  )
}
