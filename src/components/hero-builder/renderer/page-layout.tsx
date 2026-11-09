'use client'

/**
 * Page Designer layouts (`design.page.layout`): the sections of a page shown
 * as one scrolling page (default), one STEP at a time (a wizard), or as
 * folding ACCORDION panels. Pinned sections (`pin: 'bottom'`, a sticky order
 * bar) are never steps: they show on every step.
 *
 * Every section stays mounted (hidden when it isn't the current one), so a
 * form's typed answers and the checkout hook's state survive moving between
 * steps. "Next" asks the page (`PageRuntime.stepProblem`) whether the step's
 * blocks are complete and shows the reason inline when they aren't.
 *
 * Colours read the checkout / tracking vars with the builder theme as the
 * fallback, and the parts are marked (`step`, `button`, `button-alt`) so the
 * page style colours them like everything else.
 */

import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

import type { PageSettings, Section } from '@/lib/hero-builder/types'

export interface LayoutSection {
  section: Section
  node: ReactNode
}

interface PageLayoutProps {
  settings: PageSettings
  sections: readonly LayoutSection[]
  isEditor: boolean
  /** A reason the customer can't leave a step yet (given its block ids), or null. */
  stepProblem?: (blockIds: readonly string[]) => string | null
}

const ACCENT = 'var(--co-accent, var(--trk-accent, var(--hb-primary)))'
const ACCENT_TEXT = 'var(--co-accent-text, #ffffff)'
const MUTED = 'var(--co-muted, var(--trk-text-muted, var(--hb-muted)))'
const LINE = 'var(--co-border, var(--trk-card-border, #e5e7eb))'
/** Upcoming step dots: a tint of the text colour, so a strong store border can't fill them. */
const STEP_IDLE = 'color-mix(in srgb, var(--co-text, var(--trk-text, var(--hb-text, #111827))) 12%, transparent)'
const TEXT = 'var(--co-text, var(--trk-text, var(--hb-text)))'
const NO_SECTIONS: ReadonlySet<number> = new Set()

export function blockIdsOf(section: Section): string[] {
  return section.columns.flatMap((column) =>
    column.widgets.flatMap((widget) => (widget.content.kind === 'page-block' ? [widget.content.block] : [])),
  )
}

function Progress({ style, labels, current }: { style: NonNullable<PageSettings['progress']>; labels: readonly string[]; current: number }) {
  if (style === 'none' || labels.length < 2) return null
  if (style === 'bar') {
    return (
      <div className="mx-auto mb-4 w-full max-w-[720px] px-4 pt-4">
        <div className="mb-1.5 flex justify-between text-xs font-semibold" style={{ color: MUTED }}>
          <span>
            Step {current + 1} of {labels.length}
          </span>
          <span style={{ color: TEXT }}>{labels[current]}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: LINE }} data-part="step">
          <div className="h-full rounded-full transition-all" style={{ width: `${((current + 1) / labels.length) * 100}%`, background: ACCENT }} />
        </div>
      </div>
    )
  }
  return (
    <ol className="mx-auto mb-4 flex w-full max-w-[720px] items-center justify-center gap-2 px-4 pt-4" aria-label="Steps">
      {labels.map((label, index) => {
        const isDone = index < current
        const isOn = index === current
        const dot = style === 'dots'
        return (
          <li key={`${label}-${index}`} className="flex items-center gap-2">
            <span
              data-part="step"
              data-on={isOn ? '' : undefined}
              data-done={isDone ? '' : undefined}
              aria-current={isOn ? 'step' : undefined}
              aria-label={label}
              title={label}
              className={dot ? 'block h-2.5 w-2.5 rounded-full' : 'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold'}
              style={{
                background: isOn || isDone ? ACCENT : STEP_IDLE,
                color: isOn || isDone ? ACCENT_TEXT : MUTED,
                width: dot && isOn ? 22 : undefined,
              }}
            >
              {dot ? null : isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            {!dot && <span className={`hidden text-xs font-semibold sm:inline ${isOn ? '' : 'opacity-70'}`} style={{ color: isOn ? TEXT : MUTED }}>{label}</span>}
            {index < labels.length - 1 && <span className="h-px w-6 sm:w-10" style={{ background: LINE }} aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}

function StepNav({ onBack, onNext, nextLabel, problem }: { onBack?: () => void; onNext?: () => void; nextLabel: string; problem: string | null }) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-6">
      {problem && (
        <p role="alert" className="mb-2 text-sm font-medium" style={{ color: 'var(--co-error, #dc2626)' }}>
          {problem}
        </p>
      )}
      <div className="flex gap-3">
        {onBack && (
          <button type="button" onClick={onBack} data-part="button-alt" className="h-12 rounded-xl border px-5 text-sm font-semibold" style={{ borderColor: LINE, color: TEXT }}>
            Back
          </button>
        )}
        {onNext && (
          <button type="button" onClick={onNext} data-part="button" className="h-12 flex-1 rounded-xl px-5 text-sm font-bold" style={{ background: ACCENT, color: ACCENT_TEXT }}>
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function stepLabel(section: Section, index: number): string {
  return section.label?.trim() || `Step ${index + 1}`
}

/**
 * Sections whose elements all came up with nothing for this order (the schedule
 * on an order type without pre-orders). Read from the page itself, because only
 * the blocks know when they have nothing to show, and some find out late.
 */
function useEmptySections(root: RefObject<HTMLElement | null>): ReadonlySet<number> {
  const [empty, setEmpty] = useState<ReadonlySet<number>>(NO_SECTIONS)
  useEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => {
      const found = [...element.querySelectorAll<HTMLElement>('[data-layout-section]')]
        // A section of the owner's own (a background band, a spacer) stays: only blocks can come up empty.
        .filter((node) => node.querySelector('.hb-w--page-block, .hb-w--copy-text') && !node.querySelector('.hb-w:not(:empty)'))
        .map((node) => Number(node.dataset.layoutSection))
      setEmpty((current) => (found.length === current.size && found.every((id) => current.has(id)) ? current : new Set(found)))
    }
    measure()
    const observer = new MutationObserver(measure)
    observer.observe(element, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [root])
  return empty
}

/**
 * Where the customer is. A step that just came up empty hands over to the next
 * one with something to show, or the last before it, never back to the start.
 */
function currentStepIndex(allSteps: readonly LayoutSection[], steps: readonly LayoutSection[], currentId: string | null): number {
  const at = allSteps.findIndex((s) => s.section.id === currentId)
  if (at < 0) return 0
  const next = allSteps.slice(at).find((s) => steps.includes(s))
  return next ? steps.indexOf(next) : Math.max(steps.length - 1, 0)
}

/** The first step that can't be left yet, and why. */
function firstUnfinished(
  steps: readonly LayoutSection[],
  stepProblem: PageLayoutProps['stepProblem'],
): { section: Section; reason: string } | null {
  for (const { section } of steps) {
    const reason = stepProblem?.(blockIdsOf(section))
    if (reason) return { section, reason }
  }
  return null
}

/**
 * A bar pinned over the steps can be tapped from any of them: an unfinished step
 * opens with its reason, instead of a toast about answers the customer can't see.
 */
function PinnedSections({ pinned, onPlaceOrder }: { pinned: readonly LayoutSection[]; onPlaceOrder: () => boolean }) {
  return pinned.map((s) => (
    <div
      key={s.section.id}
      // No box of its own: a sticky bar sticks within its parent, and this one would be exactly its size.
      className="contents"
      onClickCapture={(event) => {
        if (!(event.target as Element).closest?.('[data-place-order]') || !onPlaceOrder()) return
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {s.node}
    </div>
  ))
}

/** The plain scrolling page: a section whose blocks all came up empty takes no room. */
export function ScrollingSections({ sections }: { sections: readonly LayoutSection[] }) {
  const root = useRef<HTMLDivElement>(null)
  const empty = useEmptySections(root)
  return (
    <div ref={root} className="contents">
      {sections.map(({ section, node }, position) => (
        <div key={section.id} data-layout-section={position} style={{ display: empty.has(position) ? 'none' : 'contents' }}>
          {node}
        </div>
      ))}
    </div>
  )
}

function Steps({ settings, sections, stepProblem }: Omit<PageLayoutProps, 'isEditor'>) {
  // By section, not position: "Show for" can add or drop an earlier step when
  // the order type changes, and the customer must stay on the step they're on.
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const top = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const empty = useEmptySections(root)
  const allSteps = sections.filter((s) => s.section.pin !== 'bottom')
  const steps = allSteps.filter((_, position) => !empty.has(position))
  const pinned = sections.filter((s) => s.section.pin === 'bottom')
  const index = currentStepIndex(allSteps, steps, currentId)
  const current = steps[index]?.section
  const moveTo = (id: string | null) => {
    setCurrentId(id)
    top.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    top.current?.focus({ preventScroll: true })
  }
  const go = (to: number) => {
    setProblem(null)
    moveTo(steps[to]?.section.id ?? null)
  }
  const next = () => {
    const reason = stepProblem?.(blockIdsOf(steps[index].section)) ?? null
    if (reason) setProblem(reason)
    else go(index + 1)
  }
  const stopAtUnfinished = () => {
    const unfinished = firstUnfinished(steps, stepProblem)
    if (!unfinished) return false
    setProblem(unfinished.reason)
    moveTo(unfinished.section.id)
    return true
  }
  return (
    <>
      <div ref={top} tabIndex={-1} className="outline-none" />
      <p className="sr-only" aria-live="polite">{current ? `Step ${index + 1} of ${steps.length}: ${stepLabel(current, index)}` : ''}</p>
      <Progress style={settings.progress ?? 'numbers'} labels={steps.map((s, i) => stepLabel(s.section, i))} current={index} />
      <div ref={root}>
        {allSteps.map((step, position) => (
          <div key={step.section.id} hidden={step.section.id !== current?.id} data-layout-section={position}>
            {step.node}
          </div>
        ))}
      </div>
      <StepNav
        onBack={index > 0 ? () => go(index - 1) : undefined}
        onNext={index < steps.length - 1 ? next : undefined}
        nextLabel={settings.nextLabel?.trim() || 'Continue'}
        problem={problem}
      />
      <PinnedSections pinned={pinned} onPlaceOrder={stopAtUnfinished} />
    </>
  )
}

function Accordion({ settings, sections, stepProblem }: Omit<PageLayoutProps, 'isEditor'>) {
  // By section, like Steps: "Show for" can add or drop a panel when the order type changes.
  const [openId, setOpenId] = useState<string | null>(null)
  const [reachedIds, setReachedIds] = useState<readonly string[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const empty = useEmptySections(root)
  const allPanels = sections.filter((s) => s.section.pin !== 'bottom')
  const panels = allPanels.filter((_, position) => !empty.has(position))
  const pinned = sections.filter((s) => s.section.pin === 'bottom')
  const reached = Math.max(0, ...reachedIds.map((id) => panels.findIndex((s) => s.section.id === id)))
  const openIndex = panels.findIndex((s) => s.section.id === openId)
  const open = openIndex >= 0 ? openIndex : reached
  const moveTo = (id: string | undefined) => {
    if (!id) return
    setOpenId(id)
    setReachedIds((current) => (current.includes(id) ? current : [...current, id]))
    // On a phone the panel above folds up and the page jumps: bring the new one back.
    requestAnimationFrame(() => {
      const position = allPanels.findIndex((s) => s.section.id === id)
      const heading = root.current?.querySelector<HTMLElement>(`[data-layout-section="${position}"] > button`)
      heading?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      heading?.focus({ preventScroll: true })
    })
  }
  const finish = (i: number) => {
    const reason = stepProblem?.(blockIdsOf(panels[i].section)) ?? null
    if (reason) return setProblem(reason)
    setProblem(null)
    moveTo(panels[i + 1]?.section.id)
  }
  const stopAtUnfinished = () => {
    const unfinished = firstUnfinished(panels, stepProblem)
    if (!unfinished) return false
    setProblem(unfinished.reason)
    moveTo(unfinished.section.id)
    return true
  }
  return (
    <>
      <div ref={root} className="mx-auto w-full max-w-[720px] space-y-3 px-4 py-4">
        {allPanels.map((panel, position) => {
          const i = panels.indexOf(panel)
          const isOpen = i === open
          const isDone = i < reached && !isOpen
          const canOpen = i <= reached
          const isLast = i === panels.length - 1
          return (
            <div key={panel.section.id} hidden={i < 0} data-part="card" data-layout-section={position} className="overflow-hidden rounded-2xl border" style={{ borderColor: LINE, background: 'var(--co-card, var(--trk-card, var(--hb-surface)))' }}>
              <button
                type="button"
                aria-expanded={isOpen}
                disabled={!canOpen}
                onClick={() => canOpen && setOpenId(panel.section.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:cursor-default"
              >
                <span
                  data-part="step"
                  data-on={isOpen ? '' : undefined}
                  data-done={isDone ? '' : undefined}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: isOpen || isDone ? ACCENT : LINE, color: isOpen || isDone ? ACCENT_TEXT : MUTED }}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span data-part="title" className="flex-1 text-base font-bold" style={{ color: canOpen ? TEXT : MUTED }}>
                  {stepLabel(panel.section, i)}
                </span>
                {isDone && <span className="text-xs font-semibold" style={{ color: ACCENT }}>Edit</span>}
                {canOpen && !isDone && <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: MUTED }} />}
              </button>
              <div hidden={!isOpen}>
                {panel.node}
                {(!isLast || (isOpen && problem)) && (
                  <StepNav onNext={isLast ? undefined : () => finish(i)} nextLabel={settings.nextLabel?.trim() || 'Continue'} problem={isOpen ? problem : null} />
                )}
              </div>
            </div>
          )
        })}
      </div>
      <PinnedSections pinned={pinned} onPlaceOrder={stopAtUnfinished} />
    </>
  )
}

/** The editor shows every section (so each stays editable) with its step badge. */
function EditorPreview({ settings, sections }: Pick<PageLayoutProps, 'settings' | 'sections'>) {
  let step = 0
  return (
    <>
      {sections.map(({ section, node }) => {
        const isPinned = section.pin === 'bottom'
        const label = isPinned ? 'Pinned to the bottom of the screen' : `${settings.layout === 'accordion' ? 'Panel' : 'Step'} ${++step} · ${stepLabel(section, step - 1)}`
        return (
          <div key={section.id}>
            <div className="pointer-events-none mx-auto flex max-w-[720px] px-4 pt-3">
              <span className="rounded-full bg-neutral-900/80 px-2.5 py-1 text-[11px] font-semibold text-white">{label}</span>
            </div>
            {node}
          </div>
        )
      })}
    </>
  )
}

export function PageLayout({ settings, sections, isEditor, stepProblem }: PageLayoutProps) {
  if (isEditor) return <EditorPreview settings={settings} sections={sections} />
  if (settings.layout === 'accordion') return <Accordion settings={settings} sections={sections} stepProblem={stepProblem} />
  return <Steps settings={settings} sections={sections} stepProblem={stepProblem} />
}
