'use client'

/**
 * The Style tab of a page block: its design (live thumbnails), one-tap
 * starting styles, the block's colours, then every part it draws (card,
 * wording, chosen / not-chosen choices, form boxes, buttons, lines…), and
 * copy / paste / apply-to-every-block. The generic outer box (the space
 * around the block) stays at the bottom, folded.
 */

import { ClipboardCopy, ClipboardPaste, Copy, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import type { HeroDesignV5, PageBlockContent, Widget } from '@/lib/hero-builder/types'
import { pageBlockDef } from '@/lib/page-designer/blocks'
import { optionGroup } from '@/lib/page-designer/knobs'
import { applyQuickStyle, blockParts, partValues, withoutParts } from '@/lib/page-designer/parts'
import type { BlockOption, BlockOptionValue, PageId } from '@/lib/page-designer/types'

import { Group } from '../controls'
import type { HeroBuilderApi } from '../use-hero-builder'
import type { NodeStyleBinding } from './node-style'
import { DesignGallery, isOptionShown, OptionField } from './page-block-knobs'
import { usePageBlock } from './page-block-fields'
import { PartStyleEditor, QuickStyles } from './part-style-editor'
import { BackgroundGroup, BorderGroup } from './style-panel'

/** The last copied block style, shared by every block in this editor session. */
let copiedStyle: Record<string, string> | null = null

/** `design` with `update` applied to every page block's options. */
export function mapPageBlocks(design: HeroDesignV5, page: PageId, update: (options: Record<string, BlockOptionValue>, block: string) => Record<string, BlockOptionValue>): HeroDesignV5 {
  return {
    ...design,
    sections: design.sections.map((section) => ({
      ...section,
      columns: section.columns.map((column) => ({
        ...column,
        widgets: column.widgets.map((widget) => {
          if (widget.content.kind !== 'page-block' || !pageBlockDef(page, widget.content.block)) return widget
          const content = widget.content as PageBlockContent
          return { ...widget, content: { ...content, options: update({ ...content.options }, content.block) } }
        }),
      })),
    })),
  }
}

export function PageBlockStyle({ widget, api, b }: { widget: Widget; api: HeroBuilderApi; b: NodeStyleBinding }) {
  const { runtime, def, options, props, setOption, setOptions } = usePageBlock(widget, api)
  const [, setClipboardTick] = useState(0)
  if (!runtime || !def || !props) return null

  const shown = def.options.filter((o) => isOptionShown(def, o, props.option))
  const designs = shown.filter((o) => optionGroup(o) === 'design')
  const colors = shown.filter((o) => optionGroup(o) === 'colors')
  const parts = blockParts(def)
  const allowed = parts.map((p) => p.id)
  const ownParts = partValues(options, allowed)
  const pageParts = partValues(api.design.page?.parts)
  const valueOf = (option: BlockOption) => props.option(option.key)
  const hasLook = Object.keys(options).some((key) => key in ownParts || colors.some((c) => c.key === key) || designs.some((d) => d.key === key))

  const copy = () => {
    copiedStyle = ownParts
    setClipboardTick((t) => t + 1)
  }
  const paste = () => {
    if (copiedStyle) setOptions({ ...withoutParts(options), ...partValues(copiedStyle, allowed) } as Record<string, BlockOptionValue>)
  }
  const applyToAll = () =>
    api.editDesign((design) =>
      mapPageBlocks(design, runtime.page, (current, block) => {
        const target = pageBlockDef(runtime.page, block)
        const targetParts = target ? blockParts(target).map((p) => p.id) : []
        return { ...withoutParts(current), ...partValues(ownParts, targetParts) } as Record<string, BlockOptionValue>
      }),
    )
  const reset = () => setOptions(Object.fromEntries(Object.entries(options).filter(([key]) => !(key in ownParts) && !colors.some((c) => c.key === key) && !designs.some((d) => d.key === key))) as Record<string, BlockOptionValue>)

  return (
    <div>
      {designs.map((option) =>
        option.type === 'choice' ? (
          <Group key={option.key} title={option.label}>
            <DesignGallery option={option} value={String(props.option(option.key))} Renderer={runtime.blocks[def.id]} props={props} onPick={(v) => setOption(option.key, v)} />
          </Group>
        ) : null,
      )}
      <Group title="Quick style">
        <QuickStyles onPick={(style) => setOptions(applyQuickStyle(options, style) as Record<string, BlockOptionValue>)} />
        <p className="text-[11px] leading-snug text-neutral-500">A starting point — change any part below after.</p>
      </Group>
      {colors.length > 0 && (
        <Group title="Block colours">
          <div className="space-y-1.5">
            {colors.map((option) => (
              <OptionField key={option.key} option={option} value={valueOf(option)} onChange={(v) => setOption(option.key, v)} />
            ))}
          </div>
          <p className="text-[11px] leading-snug text-neutral-500">
            These recolour the whole block (lighter shades follow). Blank = your Look tab / Branding Studio colours. Fine-tune each part below.
          </p>
        </Group>
      )}
      <Group title="Every part">
        <PartStyleEditor parts={parts} values={options} inherited={pageParts} followsLabel="the block colours" onChange={(key, value) => setOption(key, value)} />
      </Group>
      <div className="flex flex-wrap gap-1.5 border-b border-neutral-200 px-4 py-3">
        <ActionButton icon={ClipboardCopy} label="Copy style" onClick={copy} isDisabled={!Object.keys(ownParts).length} />
        <ActionButton icon={ClipboardPaste} label="Paste style" onClick={paste} isDisabled={!copiedStyle} />
        <ActionButton icon={Copy} label="Use on every block" onClick={applyToAll} isDisabled={!Object.keys(ownParts).length} />
        {hasLook && <ActionButton icon={RotateCcw} label="Standard look" onClick={reset} />}
      </div>
      <p className="px-4 pb-1 pt-4 text-[11px] leading-snug text-neutral-500">
        <span className="font-semibold text-neutral-700">Outer box.</span> An extra box drawn around the whole block — the block&apos;s own card is styled under Card above.
      </p>
      <BackgroundGroup b={b} allowVideo={false} />
      <BorderGroup b={b} />
    </div>
  )
}

function ActionButton({ icon: Icon, label, onClick, isDisabled }: { icon: typeof Copy; label: string; onClick: () => void; isDisabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-semibold text-neutral-700 hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  )
}
