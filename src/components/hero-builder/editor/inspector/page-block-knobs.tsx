'use client'

/**
 * Page block settings in the inspector: the design gallery (live thumbnails
 * of the block in each design), colour swatches that follow the page colours
 * until set, and the switches / choices / photos under them.
 */

import { Check, RotateCcw } from 'lucide-react'
import { useMemo } from 'react'

import { cn } from '@/lib/utils'
import { isKnobColor } from '@/lib/page-designer/knobs'
import type { BlockOption, BlockOptionValue, PageBlockDef } from '@/lib/page-designer/types'
import type { PageBlockRenderProps, PageBlockRenderer } from '@/components/hero-builder/renderer/page-runtime'

import { Field, ImageField, Segmented, Toggle } from '../controls'

type ChoiceOption = Extract<BlockOption, { type: 'choice' }>
type ColorOption = Extract<BlockOption, { type: 'color' }>

/** The block's natural width inside a thumbnail, scaled to the tile. */
const THUMB_WIDTH = 360
const THUMB_SCALE = 0.37

interface GalleryProps {
  option: ChoiceOption
  value: string
  Renderer: PageBlockRenderer | undefined
  /** The block's props as they are now; each thumbnail swaps in its own design. */
  props: PageBlockRenderProps
  onPick: (value: string) => void
}

function Thumbnail({ Renderer, props, optionKey, value }: { Renderer: PageBlockRenderer; props: PageBlockRenderProps; optionKey: string; value: string }) {
  const thumbProps = useMemo<PageBlockRenderProps>(
    () => ({ ...props, option: (key) => (key === optionKey ? value : props.option(key)) }),
    [props, optionKey, value],
  )
  return (
    <div className="h-24 overflow-hidden rounded-md bg-[var(--hb-canvas-bg,var(--brand-background,#fff))]" aria-hidden="true">
      <div inert className="pointer-events-none origin-top-left p-3" style={{ width: THUMB_WIDTH, transform: `scale(${THUMB_SCALE})` }}>
        <Renderer {...thumbProps} />
      </div>
    </div>
  )
}

/** Picture tiles of the block in each design; tap one to use it. */
export function DesignGallery({ option, value, Renderer, props, onPick }: GalleryProps) {
  return (
    <div role="radiogroup" aria-label={option.label} className="grid grid-cols-2 gap-2">
      {option.choices.map((choice) => {
        const isPicked = choice.value === value
        return (
          // A div, not a <button>: the live thumbnail inside holds the block's own buttons.
          <div
            key={choice.value}
            role="radio"
            tabIndex={0}
            aria-checked={isPicked}
            onClick={() => onPick(choice.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onPick(choice.value)
              }
            }}
            className={cn(
              'relative cursor-pointer rounded-lg border bg-white p-1 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
              isPicked ? 'border-neutral-900 ring-2 ring-neutral-900' : 'border-neutral-200 hover:border-neutral-400',
            )}
          >
            {Renderer ? <Thumbnail Renderer={Renderer} props={props} optionKey={option.key} value={choice.value} /> : <div className="h-24 rounded-md bg-neutral-100" />}
            <span className="mt-1 block px-0.5 text-[11px] font-semibold leading-tight text-neutral-900">{choice.label}</span>
            {choice.hint && <span className="block px-0.5 pb-0.5 text-[10px] leading-tight text-neutral-500">{choice.hint}</span>}
            {isPicked && (
              <span className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-white">
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** One colour: "Page colour" until the owner picks one; ↺ goes back to it. */
export function ColorKnob({ option, value, onChange }: { option: ColorOption; value: string; onChange: (value: string) => void }) {
  const isSet = isKnobColor(value)
  return (
    <div className="flex min-h-[32px] items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold leading-tight text-neutral-800">{option.label}</div>
        <div className="text-[10.5px] text-neutral-500">{isSet ? 'Only on this block' : `Page colour · ${option.follows}`}</div>
      </div>
      {isSet && (
        <button type="button" onClick={() => onChange('')} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" title="Use the page colour" aria-label={`${option.label}: use the page colour`}>
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      <label
        className={cn(
          'relative h-7 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md',
          isSet ? 'ring-2 ring-neutral-800' : 'border-[1.5px] border-dashed border-neutral-300 bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] bg-[length:8px_8px]',
        )}
      >
        {isSet && <span className="absolute inset-0" style={{ background: value }} />}
        <input
          type="color"
          value={isSet && value.length === 7 ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={option.label}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}

/** A switch, a choice or a photo setting. */
export function OptionField({ option, value, onChange }: { option: BlockOption; value: BlockOptionValue | undefined; onChange: (value: BlockOptionValue) => void }) {
  switch (option.type) {
    case 'boolean':
      return option.hint ? (
        <div>
          <Toggle label={option.label} checked={value === true} onChange={onChange} />
          <p className="mt-1 text-[11px] leading-snug text-neutral-500">{option.hint}</p>
        </div>
      ) : (
        <Toggle label={option.label} checked={value === true} onChange={onChange} />
      )
    case 'choice':
      return (
        <Field label={option.label} hint={option.hint}>
          <Segmented value={String(value)} onChange={onChange} options={option.choices.map((c) => ({ value: c.value, label: c.label }))} />
        </Field>
      )
    case 'image':
      return (
        <Field label={option.label} hint={option.hint}>
          <ImageField value={typeof value === 'string' && value ? value : undefined} onChange={(url) => onChange(url)} />
        </Field>
      )
    case 'color':
      return <ColorKnob option={option} value={typeof value === 'string' ? value : ''} onChange={onChange} />
  }
}

/** Whether a setting applies to the block as it is set now (its showWhen). */
export function isOptionShown(def: PageBlockDef, option: BlockOption, read: (key: string) => BlockOptionValue | undefined): boolean {
  if (!option.showWhen) return true
  const current = read(option.showWhen.key)
  return current !== undefined && option.showWhen.values.includes(current)
}
