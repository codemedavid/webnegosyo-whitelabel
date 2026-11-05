'use client'

import { Lock, Paintbrush, Undo2 } from 'lucide-react'
import { useMemo } from 'react'

import type { PageBlockContent, Widget } from '@/lib/hero-builder/types'
import { PAGE_META } from '@/lib/page-designer/pages'
import { NEED_REASONS, pageBlockDef } from '@/lib/page-designer/blocks'
import { optionGroup } from '@/lib/page-designer/knobs'
import { applyTokens, resolveBlockOption, resolveBlockText } from '@/lib/page-designer/text'
import type { BlockOption, BlockOptionValue, BlockTextSlot, PageId } from '@/lib/page-designer/types'
import { usePageRuntime, type PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'

import { Field, Group, TextArea, TextInput } from '../controls'
import { isOptionShown, OptionField } from './page-block-knobs'
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

/** A page block's registry entry and the props the canvas renders it with (null outside its page). */
export function usePageBlock(widget: Widget, api: HeroBuilderApi) {
  const runtime = usePageRuntime()
  const content = widget.content as PageBlockContent
  const def = runtime ? pageBlockDef(runtime.page, content.block) : null
  const texts = useMemo(() => content.texts ?? {}, [content.texts])
  const options = useMemo(() => content.options ?? {}, [content.options])
  // The block's props as the canvas renders them: the design gallery redraws them per design.
  const props = useMemo<PageBlockRenderProps | null>(() => {
    if (!runtime || !def) return null
    return {
      def,
      text: (slot) => applyTokens(resolveBlockText(def, slot, texts, runtime.labels), runtime.tokens),
      option: (key) => resolveBlockOption(def, key, options),
      isEditor: true,
    }
  }, [runtime, def, texts, options])
  const setOption = (key: string, value: BlockOptionValue) => {
    const next = { ...options, [key]: value }
    // A blank colour, photo or style = follow the page / none: drop the key.
    if (value === '') delete next[key]
    api.editContent(widget.id, { options: next } as Partial<PageBlockContent>, `option:${key}`)
  }
  const setOptions = (next: Record<string, BlockOptionValue>) => api.editContent(widget.id, { options: next } as Partial<PageBlockContent>)
  return { runtime, def, texts, options, props, setOption, setOptions }
}

/** The inspector's Content tab for a page block: what it is, its wording and switches (looks are on Style). */
export function PageBlockFields({ widget, api }: { widget: Widget; api: HeroBuilderApi }) {
  const { runtime, def, texts, options, props, setOption } = usePageBlock(widget, api)
  if (!runtime || !def || !props) {
    return <p className="px-4 py-3 text-xs text-neutral-500">This block belongs to another page. Remove it.</p>
  }
  const setText = (key: string, value: string) => {
    const next = { ...texts, [key]: value }
    if (!value) delete next[key]
    api.editContent(widget.id, { texts: next } as Partial<PageBlockContent>, `text:${key}`)
  }

  const shown = def.options.filter((o) => isOptionShown(def, o, props.option))
  const inGroup = (group: string) => shown.filter((o) => optionGroup(o) === group)
  const switches = inGroup('options')
  const more = inGroup('advanced')
  // Photos are typed or picked in steps: show what is stored, not the fallback.
  const valueOf = (option: BlockOption) => (option.type === 'image' ? (typeof options[option.key] === 'string' ? options[option.key] : '') : props.option(option.key))
  // A page's own editor for this block (the checkout form's questions), under Settings.
  const Panel = runtime.blockPanels?.[def.id]

  return (
    <div>
      <div className="mx-4 my-3 rounded-lg bg-neutral-50 p-2.5 text-[11px] leading-snug text-neutral-600">
        <p className="font-semibold text-neutral-800">{def.label}</p>
        <p>{def.description}</p>
        {def.required && (
          <p className="mt-1.5 flex items-center gap-1 font-medium text-amber-800">
            <Lock className="h-3 w-3" /> Keeps the page working — move, restyle or re-word it, but it can&apos;t be removed.
          </p>
        )}
        {def.neededWhen && (
          <p className="mt-1.5 flex items-start gap-1 font-medium text-amber-800">
            <Undo2 className="mt-0.5 h-3 w-3 shrink-0" /> You can remove or hide it. It comes back by itself while {NEED_REASONS[def.neededWhen]}, so orders still go through.
          </p>
        )}
        <p className="mt-1.5 flex items-center gap-1 font-medium text-sky-800">
          <Paintbrush className="h-3 w-3" /> Designs, colours and every part&apos;s style are on the Style tab.
        </p>
      </div>
      {def.texts.length > 0 && (
        <Group title="Words">
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
        </Group>
      )}
      {switches.length > 0 && (
        <Group title="Settings">
          <div className="space-y-3">
            {switches.map((option) => (
              <OptionField key={option.key} option={option} value={valueOf(option)} onChange={(v) => setOption(option.key, v)} />
            ))}
          </div>
        </Group>
      )}
      {Panel && <Panel widget={widget} />}
      {more.length > 0 && (
        <Group title="More" defaultOpen={false}>
          <div className="space-y-3">
            {more.map((option) => (
              <OptionField key={option.key} option={option} value={valueOf(option)} onChange={(v) => setOption(option.key, v)} />
            ))}
          </div>
        </Group>
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
