// ---------------------------------------------------------------------------
// The small kit every Page Designer template is built with: page blocks with
// their settings, wording and part styles, page sections (incl. the pinned
// bottom bar) and the design-level page settings (layout, page parts).
//
// Templates follow the store's colours (Look tab / Branding Studio → --co-* /
// --trk-*): part styles set SHAPE and TYPE (corners, borders, shadows, sizes,
// fonts); a fixed colour appears only where a style needs a neutral one
// (receipt paper, bold-blocks ink) and is listed next to its template.
//
// Every value is checked here, so a typo fails the build of the template (and
// its test) instead of shipping a design the publish check would refuse.
// ---------------------------------------------------------------------------

import { box, design, section } from '@/lib/hero-builder/section-presets'
import type { Background, HeroDesignV5, NodeStyle, PageSettings, Section, Theme, Widget } from '@/lib/hero-builder/types'

import { blockDef } from './blocks'
import { createPageBlock } from './design-blocks'
import { isValidOptionValue } from './knobs'
import { blockParts, isValidPartValue, partOfKey } from './parts'
import type { PageId } from './types'

export type BlockOptions = Readonly<Record<string, string | boolean>>
export type PartStyles = Readonly<Record<string, string>>
export type BlockTexts = Readonly<Record<string, string>>

export interface BlockSpec {
  /** Registry options (designs, switches). Unknown keys or values throw. */
  options?: BlockOptions
  /** Part styles (`p_<part>_<prop>`). Parts the block doesn't draw are left to the page style. */
  parts?: PartStyles
  /** The owner's wording per text slot. Unknown slots or too-long words throw. */
  texts?: BlockTexts
}

function assertPart(key: string, value: string): void {
  if (!isValidPartValue(key, value)) throw new Error(`Invalid part style ${key}=${value}`)
}

/** The valid part styles of `parts` the block `id` draws (all are checked first). */
function blockPartStyles(id: string, parts: PartStyles): Record<string, string> {
  const def = blockDef(id)
  const allowed = new Set(def ? blockParts(def).map((part) => part.id) : [])
  const kept: Record<string, string> = {}
  for (const [key, value] of Object.entries(parts)) {
    assertPart(key, value)
    const part = partOfKey(key)
    if (part && allowed.has(part)) kept[key] = value
  }
  return kept
}

/** One page block of `page` with its settings, wording and part styles. */
export function block(page: PageId, id: string, spec: BlockSpec = {}): Widget {
  const def = blockDef(id)
  if (!def || def.page !== page) throw new Error(`Unknown ${page} block ${id}`)
  for (const [key, value] of Object.entries(spec.options ?? {})) {
    const option = def.options.find((o) => o.key === key)
    if (!option) throw new Error(`${id} has no setting "${key}"`)
    if (!isValidOptionValue(option, value)) throw new Error(`${id}: invalid ${key}=${String(value)}`)
  }
  for (const [key, value] of Object.entries(spec.texts ?? {})) {
    const slot = def.texts.find((t) => t.key === key)
    if (!slot) throw new Error(`${id} has no text "${key}"`)
    if (value.length > slot.maxLength) throw new Error(`${id}: "${key}" is longer than ${slot.maxLength}`)
  }
  const widget = createPageBlock(def)
  return {
    ...widget,
    content: {
      ...widget.content,
      texts: { ...spec.texts },
      options: { ...widget.content.options, ...spec.options, ...blockPartStyles(id, spec.parts ?? {}) },
    },
  }
}

/**
 * Several blocks sharing settings: each takes only the options it has (a
 * block never carries a setting it doesn't use) and the part styles it draws.
 */
export function blocks(page: PageId, ids: readonly string[], spec: Omit<BlockSpec, 'texts'> = {}): Widget[] {
  return ids.map((id) => {
    const keys = new Set(blockDef(id)?.options.map((o) => o.key) ?? [])
    const options = Object.fromEntries(Object.entries(spec.options ?? {}).filter(([key]) => keys.has(key)))
    return block(page, id, { options, parts: spec.parts })
  })
}

/** Page-wide part styles, every value checked. */
export function pageParts(parts: PartStyles): Record<string, string> {
  for (const [key, value] of Object.entries(parts)) assertPart(key, value)
  return { ...parts }
}

/** `widget` shown only in some page states ("Show when"). */
export function onlyWhen(widget: Widget, states: readonly string[]): Widget {
  return { ...widget, showWhen: [...states] }
}

/** The tidy delivery address + question marks every template's form starts from. */
export const TIDY_FORM = { address_map: 'links', address_details: 'tucked', field_marks: 'optional' } as const

export const centred = (style: NodeStyle): NodeStyle => ({ textAlign: 'center', ...style })

export const solid = (color: string): Background => ({ type: 'color', color })

export interface SectionOptions {
  width?: number
  gap?: number
  padding?: NodeStyle['padding']
  mobilePadding?: NodeStyle['padding']
  /** Extra desktop style (background, borders…). */
  style?: NodeStyle
  showWhen?: readonly string[]
}

const PADDING = box(24, 16, 40, 16)
const PADDING_MOBILE = box(16, 12, 32, 12)

/** One phone-first column of widgets. `label` is the step title in step-by-step layouts. */
export function pageSection(label: string, widgets: Widget[], options: SectionOptions = {}): Section {
  const { width = 720, gap = 16, padding = PADDING, mobilePadding = PADDING_MOBILE, style = {}, showWhen } = options
  const built = section({
    label,
    widths: [100],
    style: { padding, contentWidth: width, gap, ...style },
    tablet: { padding },
    mobile: { stack: true, gap, padding: mobilePadding },
    columns: [{ style: { gap }, widgets }],
  })
  return showWhen?.length ? { ...built, showWhen: [...showWhen] } : built
}

/** A section pinned to the bottom of the screen (the sticky order bar), on every step. */
export function pinnedBar(label: string, widgets: Widget[], options: SectionOptions = {}): Section {
  const bar = pageSection(label, widgets, {
    gap: 8,
    padding: box(12, 16, 12, 16),
    mobilePadding: box(10, 12, 12, 12),
    ...options,
    style: { background: solid('@surface'), shadow: 'lg', ...options.style },
  })
  return { ...bar, pin: 'bottom' }
}

/** A design with page settings (only the ones given). */
export function pageDesign(sections: Section[], settings: PageSettings = {}, theme: Partial<Theme> = {}): HeroDesignV5 {
  const base = design(sections, theme)
  const page: PageSettings = {
    ...(settings.parts && Object.keys(settings.parts).length ? { parts: pageParts(settings.parts) } : {}),
    ...(settings.layout ? { layout: settings.layout } : {}),
    ...(settings.progress ? { progress: settings.progress } : {}),
    ...(settings.nextLabel ? { nextLabel: settings.nextLabel } : {}),
  }
  return Object.keys(page).length ? { ...base, page } : base
}
