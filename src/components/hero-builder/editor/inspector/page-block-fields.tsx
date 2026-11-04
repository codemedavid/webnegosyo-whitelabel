'use client'

import { Lock } from 'lucide-react'

import type { PageBlockContent, Widget } from '@/lib/hero-builder/types'
import { PAGE_META } from '@/lib/page-designer/pages'
import { pageBlockDef } from '@/lib/page-designer/blocks'
import { resolveBlockOption, resolveBlockText } from '@/lib/page-designer/text'
import type { BlockTextSlot, PageId } from '@/lib/page-designer/types'
import { usePageRuntime } from '@/components/hero-builder/renderer/page-runtime'

import { Field, Group, Segmented, TextArea, TextInput, Toggle } from '../controls'
import type { HeroBuilderApi } from '../use-hero-builder'

/** "Type {name} for the customer's first name…" for this page. */
export function tokenHint(page: PageId): string {
  const tokens = PAGE_META[page].tokens.map((t) => `{${t.token}} ${t.label.toLowerCase()}`)
  return tokens.length ? ` Type ${tokens.join(', ')}.` : ''
}

function SlotField({ slot, value, placeholder, onChange }: { slot: BlockTextSlot; value: string; placeholder: string; onChange: (v: string) => void }) {
  const Input = slot.multiline ? TextArea : TextInput
  return (
    <Field label={slot.label} hint={slot.hint ?? (slot.labelKey ? 'Blank uses your Branding Studio wording.' : 'Blank uses the standard wording.')}>
      <Input value={value} placeholder={placeholder} maxLength={slot.maxLength} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

/** The inspector for a page block: what it is, its wording and its switches. */
export function PageBlockFields({ widget, api }: { widget: Widget; api: HeroBuilderApi }) {
  const runtime = usePageRuntime()
  const content = widget.content as PageBlockContent
  const def = runtime ? pageBlockDef(runtime.page, content.block) : null
  if (!runtime || !def) {
    return <p className="text-xs text-neutral-500">This block belongs to another page. Remove it.</p>
  }
  const texts = content.texts ?? {}
  const options = content.options ?? {}
  const setText = (key: string, value: string) => {
    const next = { ...texts, [key]: value }
    if (!value) delete next[key]
    api.editContent(widget.id, { texts: next } as Partial<PageBlockContent>, `text:${key}`)
  }
  const setOption = (key: string, value: string | boolean) =>
    api.editContent(widget.id, { options: { ...options, [key]: value } } as Partial<PageBlockContent>)

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-neutral-50 p-2.5 text-[11px] leading-snug text-neutral-600">
        <p className="font-semibold text-neutral-800">{def.label}</p>
        <p>{def.description}</p>
        {def.required && (
          <p className="mt-1.5 flex items-center gap-1 font-medium text-amber-800">
            <Lock className="h-3 w-3" /> Keeps the page working — move, restyle or re-word it, but it can&apos;t be removed.
          </p>
        )}
      </div>
      {def.texts.length > 0 && (
        <div className="space-y-3">
          {def.texts.map((slot) => (
            <SlotField
              key={slot.key}
              slot={slot}
              value={texts[slot.key] ?? ''}
              // What shows when blank: the store label, else the standard words.
              placeholder={resolveBlockText(def, slot.key, {}, runtime.labels)}
              onChange={(v) => setText(slot.key, v)}
            />
          ))}
          <p className="text-[11px] leading-snug text-neutral-500">{tokenHint(runtime.page).trim()}</p>
        </div>
      )}
      {def.options.map((option) =>
        option.type === 'boolean' ? (
          <Toggle
            key={option.key}
            label={option.label}
            checked={resolveBlockOption(def, option.key, options) === true}
            onChange={(v) => setOption(option.key, v)}
          />
        ) : (
          <Field key={option.key} label={option.label} hint={option.hint}>
            <Segmented
              value={String(resolveBlockOption(def, option.key, options))}
              onChange={(v) => setOption(option.key, v)}
              options={option.choices.map((c) => ({ value: c.value, label: c.label }))}
            />
          </Field>
        ),
      )}
      {def.texts.length === 0 && def.options.length === 0 && (
        <p className="text-[11px] leading-snug text-neutral-500">Use the Style and Layout tabs to change how this block sits on the page.</p>
      )}
    </div>
  )
}

/** "Show when": limit a section or element to some of the page's states. */
export function ShowWhenGroup({ node, api }: { node: { id: string; showWhen?: string[] }; api: HeroBuilderApi }) {
  const runtime = usePageRuntime()
  const states = runtime ? PAGE_META[runtime.page].states : []
  if (!runtime || !states.length) return null
  const current = node.showWhen ?? []
  const isLocked = !api.canRemove(node.id)
  const toggle = (id: string) => {
    const next = current.includes(id) ? current.filter((s) => s !== id) : [...current, id]
    api.editShowWhen(node.id, states.map((s) => s.id).filter((s) => next.includes(s)))
  }
  return (
    <Group title="Show when">
      {isLocked ? (
        <p className="text-[11px] leading-snug text-neutral-500">This holds a block that keeps the page working, so it always shows.</p>
      ) : (
        <>
          <p className="mb-2 text-[11px] leading-snug text-neutral-500">
            {current.length ? 'Only shows while the order is:' : 'Always shows. Pick stages to show it only then — e.g. a message while Preparing.'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {states.map((state) => {
              const isOn = current.includes(state.id)
              return (
                <button
                  key={state.id}
                  type="button"
                  aria-pressed={isOn}
                  onClick={() => toggle(state.id)}
                  className={isOn ? 'rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white' : 'rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:border-neutral-400'}
                >
                  {state.label}
                </button>
              )
            })}
          </div>
          {current.length > 0 && (
            <button type="button" onClick={() => api.editShowWhen(node.id, [])} className="mt-2 text-[11px] font-semibold text-sky-700 hover:underline">
              Always show
            </button>
          )}
        </>
      )}
    </Group>
  )
}
