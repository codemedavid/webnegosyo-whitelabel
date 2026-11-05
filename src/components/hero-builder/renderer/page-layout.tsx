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
import { useRef, useState, type ReactNode } from 'react'

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
const TEXT = 'var(--co-text, var(--trk-text, var(--hb-text)))'

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
              title={label}
              className={dot ? 'block h-2.5 w-2.5 rounded-full' : 'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold'}
              style={{
                background: isOn || isDone ? ACCENT : LINE,
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

function Steps({ settings, sections, stepProblem }: Omit<PageLayoutProps, 'isEditor'>) {
  const [current, setCurrent] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const top = useRef<HTMLDivElement>(null)
  const steps = sections.filter((s) => s.section.pin !== 'bottom')
  const pinned = sections.filter((s) => s.section.pin === 'bottom')
  const index = Math.min(current, Math.max(steps.length - 1, 0))
  const go = (to: number) => {
    setProblem(null)
    setCurrent(to)
    top.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }
  const next = () => {
    const reason = stepProblem?.(blockIdsOf(steps[index].section)) ?? null
    if (reason) setProblem(reason)
    else go(index + 1)
  }
  return (
    <>
      <div ref={top} aria-hidden="true" />
      <Progress style={settings.progress ?? 'numbers'} labels={steps.map((s, i) => stepLabel(s.section, i))} current={index} />
      {steps.map((step, i) => (
        <div key={step.section.id} hidden={i !== index} data-step={i}>
          {step.node}
        </div>
      ))}
      <StepNav
        onBack={index > 0 ? () => go(index - 1) : undefined}
        onNext={index < steps.length - 1 ? next : undefined}
        nextLabel={settings.nextLabel?.trim() || 'Continue'}
        problem={problem}
      />
      {pinned.map((s) => (
        <div key={s.section.id}>{s.node}</div>
      ))}
    </>
  )
}

function Accordion({ settings, sections, stepProblem }: Omit<PageLayoutProps, 'isEditor'>) {
  const [open, setOpen] = useState(0)
  const [reached, setReached] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const panels = sections.filter((s) => s.section.pin !== 'bottom')
  const pinned = sections.filter((s) => s.section.pin === 'bottom')
  const finish = (i: number) => {
    const reason = stepProblem?.(blockIdsOf(panels[i].section)) ?? null
    if (reason) return setProblem(reason)
    setProblem(null)
    setOpen(i + 1)
    setReached((r) => Math.max(r, i + 1))
  }
  return (
    <>
      <div className="mx-auto w-full max-w-[720px] space-y-3 px-4 py-4">
        {panels.map((panel, i) => {
          const isOpen = i === open
          const isDone = i < reached && !isOpen
          const canOpen = i <= reached
          return (
            <div key={panel.section.id} data-part="card" className="overflow-hidden rounded-2xl border" style={{ borderColor: LINE, background: 'var(--co-card, var(--trk-card, var(--hb-surface)))' }}>
              <button
                type="button"
                aria-expanded={isOpen}
                disabled={!canOpen}
                onClick={() => canOpen && setOpen(i)}
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
                {i < panels.length - 1 && (
                  <StepNav onNext={() => finish(i)} nextLabel={settings.nextLabel?.trim() || 'Continue'} problem={isOpen ? problem : null} />
                )}
              </div>
            </div>
          )
        })}
      </div>
      {pinned.map((s) => (
        <div key={s.section.id}>{s.node}</div>
      ))}
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
