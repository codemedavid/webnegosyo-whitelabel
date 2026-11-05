'use client'

/**
 * "Page style" at the top of the Look tab: one look for every block on the
 * page (cards, wording, chosen / not-chosen choices, form boxes, buttons…).
 * A block's own Style tab still wins over it. Stored in the design
 * (`design.page.parts`), published with it. Blank = the block's standard
 * look in your Look colours.
 */

import { RotateCcw } from 'lucide-react'
import { useState } from 'react'

import type { PageLayout, PageSettings } from '@/lib/hero-builder/types'
import { applyQuickStyle, partValues, PARTS, type PartDef } from '@/lib/page-designer/parts'
import { cn } from '@/lib/utils'
import type { HeroBuilderApi } from '@/components/hero-builder/editor/use-hero-builder'
import { PartStyleEditor, QuickStyles } from '@/components/hero-builder/editor/inspector/part-style-editor'

const ALL_PARTS: readonly PartDef[] = PARTS

const LAYOUTS: readonly { value: PageLayout; label: string; hint: string }[] = [
  { value: 'scroll', label: 'One page', hint: 'Everything on one scrolling page.' },
  { value: 'steps', label: 'Step by step', hint: 'Each section is a step with Next / Back.' },
  { value: 'accordion', label: 'Folding panels', hint: 'Numbered panels; finished ones fold up.' },
]
const PROGRESS: readonly { value: NonNullable<PageSettings['progress']>; label: string }[] = [
  { value: 'numbers', label: 'Numbers' },
  { value: 'bar', label: 'Bar' },
  { value: 'dots', label: 'Dots' },
  { value: 'none', label: 'None' },
]

function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-2.5 py-1.5 text-[11px] font-semibold',
            value === option.value ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-600 hover:border-neutral-400',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** One page / step by step / folding panels, and how steps show their progress. */
export function PageLayoutControls({ api }: { api: HeroBuilderApi }) {
  const page = api.design.page
  const layout = page?.layout ?? 'scroll'
  const sections = api.design.sections.filter((s) => s.pin !== 'bottom').length
  return (
    <div className="space-y-2.5">
      <Chips label="Layout" value={layout} options={LAYOUTS} onChange={(v) => editPageSettings(api, { layout: v === 'scroll' ? undefined : v })} />
      <p className="text-[11px] leading-snug text-neutral-500">{LAYOUTS.find((l) => l.value === layout)?.hint}</p>
      {layout !== 'scroll' && sections < 2 && (
        <p className="rounded-md bg-amber-50 p-2 text-[11px] leading-snug text-amber-900">
          Each section is one {layout === 'steps' ? 'step' : 'panel'}. Add sections (Add → Sections) or pick a step-by-step template, then move blocks into them.
        </p>
      )}
      {layout === 'steps' && (
        <div>
          <p className="mb-1 text-[11px] font-semibold text-neutral-700">Progress</p>
          <Chips label="Progress" value={page?.progress ?? 'numbers'} options={PROGRESS} onChange={(v) => editPageSettings(api, { progress: v === 'numbers' ? undefined : v })} />
        </div>
      )}
      {layout !== 'scroll' && (
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-neutral-700">Next button words</span>
          <input
            value={page?.nextLabel ?? ''}
            maxLength={40}
            placeholder="Continue"
            onChange={(e) => editPageSettings(api, { nextLabel: e.target.value || undefined }, 'nextLabel')}
            className="h-8 w-full rounded-md border border-neutral-200 px-2 text-[12px]"
          />
        </label>
      )}
      <p className="text-[11px] leading-snug text-neutral-500">Tip: select a section and switch on “Pin to the bottom of the screen” for a sticky order bar.</p>
    </div>
  )
}

export function editPageSettings(api: HeroBuilderApi, patch: Partial<PageSettings>, key?: string): void {
  api.editDesign((design) => {
    // Drop blank settings so an untouched page stores nothing.
    const page = Object.fromEntries(
      Object.entries({ ...design.page, ...patch }).filter(([, v]) => v !== undefined && !(typeof v === 'object' && !Object.keys(v).length)),
    ) as PageSettings
    return { ...design, page: Object.keys(page).length ? page : undefined }
  }, key)
}

export function PageStylePanel({ api }: { api: HeroBuilderApi }) {
  const [isOpen, setOpen] = useState(false)
  const parts = partValues(api.design.page?.parts)
  const count = Object.keys(parts).length
  const setParts = (next: Record<string, string>) => editPageSettings(api, { parts: next })
  const setPart = (key: string, value: string) => {
    const next = { ...parts, [key]: value }
    if (!value) delete next[key]
    editPageSettings(api, { parts: next }, `part:${key}`)
  }
  return (
    <section className="border-b border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 hover:text-neutral-900"
      >
        <span>
          Page style{count > 0 && <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 text-[10px] font-bold normal-case tracking-normal text-sky-800">{count}</span>}
        </span>
        <span aria-hidden="true" className={cn('text-neutral-400 transition-transform', isOpen ? 'rotate-90' : '')}>›</span>
      </button>
      {isOpen && (
        <div className="space-y-4 px-4 pb-4">
          <p className="rounded-lg bg-neutral-50 p-2.5 text-[11px] leading-snug text-neutral-600">
            One look for every block on this page. A block&apos;s own Style tab wins over this. Colours left blank follow your store colours below.
          </p>
          <div>
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-neutral-400">Layout</p>
            <PageLayoutControls api={api} />
          </div>
          <div>
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-neutral-400">Quick style</p>
            <QuickStyles onPick={(style) => setParts(partValues(applyQuickStyle(parts, style)))} />
          </div>
          <PartStyleEditor parts={ALL_PARTS} values={parts} followsLabel="your store colours" onChange={setPart} />
          {count > 0 && (
            <button type="button" onClick={() => setParts({})} className="flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline">
              <RotateCcw className="h-3 w-3" /> Reset the page style
            </button>
          )}
        </div>
      )}
    </section>
  )
}
