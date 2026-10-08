'use client'

import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Apple, ArrowUpRight, Check, ChevronDown, PlayCircle, Smartphone } from 'lucide-react'
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

/** Store-badge-shaped download buttons: the shape owners already trust. */
function StoreBadge({ download }: { download: AppDownloadLink }) {
  const isIos = download.platform === 'ios'
  const Icon = isIos ? Apple : Smartphone
  return (
    <a href={download.href} target="_blank" rel="noopener noreferrer"
      className={`inline-flex h-14 min-w-[10.5rem] items-center gap-3 rounded-xl bg-[#111] px-4 text-white transition-colors hover:bg-black ${FOCUS_RING}`}>
      <Icon className="h-6 w-6 shrink-0" strokeWidth={isIos ? 1.75 : 1.5} aria-hidden />
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
