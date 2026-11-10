/**
 * Helpers for the Page Designer show-toggle tests: a block rendered with a
 * switch off must equal the same block rendered with defaults, minus the
 * part the switch names. Compared by a signature (all text + every
 * `data-part` mark, in order), so a class that only follows from the part
 * (a margin that tightens when the part is gone) doesn't count as a change.
 */

import type { PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'
import type { BlockOptionValue, PageBlockDef } from '@/lib/page-designer/types'

/** Picks the part's elements out of a default render. */
export type PartPicker = (root: HTMLElement) => Element[]

/** Text and part marks, in document order. */
export function signature(root: ParentNode): string {
  const marks = Array.from(root.querySelectorAll('[data-part]')).map((el) => el.getAttribute('data-part'))
  return `${(root.textContent ?? '').replace(/\s+/g, ' ').trim()} | ${marks.join(',')}`
}

/** The default render with the picked elements removed (on a copy). */
export function withoutPart(root: HTMLElement, pick: PartPicker): { stripped: HTMLElement; removed: number } {
  const copy = root.cloneNode(true) as HTMLElement
  const found = pick(copy)
  found.forEach((el) => el.remove())
  return { stripped: copy, removed: found.length }
}

/** Elements matching `selector` whose text contains `text`, each passed through `lift` (e.g. to its row). */
export function byText(selector: string, text: string, lift: (el: Element) => Element = (el) => el): PartPicker {
  return (root) =>
    Array.from(root.querySelectorAll(selector))
      .filter((el) => (el.textContent ?? '').includes(text))
      .map(lift)
}

/** Every element matching `selector`. */
export const all = (selector: string, lift: (el: Element) => Element = (el) => el): PartPicker =>
  (root) => Array.from(root.querySelectorAll(selector)).map(lift)

/** Several pickers' elements together. */
export const both = (...pickers: PartPicker[]): PartPicker => (root) => pickers.flatMap((pick) => pick(root))

/**
 * Render props for `def` in `variant`: text slots at their fallbacks,
 * options at their registry defaults with `overrides` on top. `bare`
 * leaves every option but the design unset (a block stored before its
 * settings existed).
 */
export function blockProps(
  def: PageBlockDef,
  variant: string | undefined,
  overrides: Readonly<Record<string, BlockOptionValue>> = {},
  bare = false,
): PageBlockRenderProps {
  return {
    def,
    text: (slot) => def.texts.find((t) => t.key === slot)?.fallback ?? '',
    option: (key) => {
      if (key === 'variant' && variant) return variant
      if (key in overrides) return overrides[key]
      return bare ? undefined : def.options.find((o) => o.key === key)?.default
    },
    isEditor: false,
  }
}

/** The block's designs (`[undefined]` for a block without any). */
export function designsOf(def: PageBlockDef): readonly (string | undefined)[] {
  const variant = def.options.find((o) => o.key === 'variant')
  return variant?.type === 'choice' ? variant.choices.map((c) => c.value) : [undefined]
}
