// ---------------------------------------------------------------------------
// Part styles: the owner styles any PART of a page block (its card, title,
// the unselected / selected options, the form fields, the button…) from the
// inspector's Style tab, or the same parts for the whole page.
//
// Components mark their parts with `data-part="<part>"` (and `data-on` on a
// chosen option). A part style is a flat key `p_<part>_<prop>` → value,
// stored in the block's `content.options` (block level) or the design's
// `page.parts` (whole page). css.ts turns them into scoped rules:
//
//   .<scope> [data-part="option"][data-on] { background-color: #… !important }
//   .<scope> .<widget> [data-part="option"][data-on] { … }   ← block wins
//
// Nothing set = no rule at all, so an unstyled block renders exactly as it
// did before parts existed. Every value is re-validated here (enum or hex)
// because the result is injected into a <style> element.
// ---------------------------------------------------------------------------

import { FONT_OPTIONS } from '@/lib/hero-builder/constants'

import type { PageBlockDef } from './types'

export type PartPropKind = 'color' | 'choice'

export interface PartPropChoice {
  value: string
  label: string
}

export interface PartPropDef {
  id: string
  label: string
  kind: PartPropKind
  choices?: readonly PartPropChoice[]
}

export interface PartDef {
  id: string
  label: string
  /** Inspector group heading. */
  group: string
  hint?: string
  props: readonly string[]
}

// ── Props ─────────────────────────────────────────────────────────────────

const c = (id: string, label: string): PartPropDef => ({ id, label, kind: 'color' })
const ch = (id: string, label: string, choices: readonly PartPropChoice[]): PartPropDef => ({ id, label, kind: 'choice', choices })
const opts = (...pairs: [string, string][]): PartPropChoice[] => pairs.map(([value, label]) => ({ value, label }))

const RADIUS = { none: '0px', sm: '6px', md: '12px', lg: '18px', xl: '24px', pill: '999px' } as const
const BORDER_WIDTH = { '0': '0px', '1': '1px', '2': '2px', '3': '3px', '4': '4px' } as const
const BORDER_STYLE = { solid: 'solid', dashed: 'dashed', dotted: 'dotted', none: 'none' } as const
const SHADOW = {
  none: 'none',
  sm: '0 1px 2px rgba(15,23,42,.08)',
  md: '0 4px 12px rgba(15,23,42,.10)',
  lg: '0 12px 32px rgba(15,23,42,.14)',
  hard: '4px 4px 0 0 currentColor',
  glow: '0 0 0 4px rgba(15,23,42,.06)',
} as const
const TEXT_SIZE = { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem' } as const
const WEIGHT = { '400': '400', '500': '500', '600': '600', '700': '700', '800': '800', '900': '900' } as const
const ALIGN = { left: 'left', center: 'center', right: 'right' } as const
const CASE = { none: 'none', upper: 'uppercase', lower: 'lowercase', title: 'capitalize' } as const
const HEIGHT = { sm: '40px', md: '48px', lg: '56px', xl: '64px' } as const
const SPACE = { tight: '12px', normal: '20px', roomy: '28px' } as const
const LETTER = { tight: '-0.02em', normal: '0', wide: '0.06em' } as const
const UNDERLINE = { yes: 'underline', no: 'none' } as const

export const PART_PROPS: Readonly<Record<string, PartPropDef>> = {
  bg: c('bg', 'Fill'),
  color: c('color', 'Text'),
  border: c('border', 'Border colour'),
  icon: c('icon', 'Icon'),
  placeholder: c('placeholder', 'Hint text'),
  focus: c('focus', 'While typing'),
  bw: ch('bw', 'Border width', opts(['0', 'None'], ['1', 'Thin'], ['2', 'Medium'], ['3', 'Thick'], ['4', 'Heavy'])),
  bs: ch('bs', 'Border style', opts(['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['none', 'None'])),
  radius: ch('radius', 'Corners', opts(['none', 'Square'], ['sm', 'Slight'], ['md', 'Soft'], ['lg', 'Round'], ['xl', 'Rounder'], ['pill', 'Pill'])),
  shadow: ch('shadow', 'Shadow', opts(['none', 'None'], ['sm', 'Subtle'], ['md', 'Soft'], ['lg', 'Lifted'], ['hard', 'Hard'], ['glow', 'Ring'])),
  size: ch('size', 'Size', opts(['xs', 'XS'], ['sm', 'S'], ['md', 'M'], ['lg', 'L'], ['xl', 'XL'], ['2xl', '2XL'], ['3xl', '3XL'])),
  weight: ch('weight', 'Weight', opts(['400', 'Regular'], ['500', 'Medium'], ['600', 'Semi-bold'], ['700', 'Bold'], ['800', 'Extra bold'], ['900', 'Black'])),
  align: ch('align', 'Align', opts(['left', 'Left'], ['center', 'Centre'], ['right', 'Right'])),
  case: ch('case', 'Letters', opts(['none', 'As typed'], ['upper', 'CAPS'], ['lower', 'lower'], ['title', 'Title Case'])),
  letter: ch('letter', 'Spacing', opts(['tight', 'Tight'], ['normal', 'Normal'], ['wide', 'Wide'])),
  font: ch('font', 'Font', Object.entries(FONT_OPTIONS).map(([value, f]) => ({ value, label: f.label }))),
  height: ch('height', 'Height', opts(['sm', 'S'], ['md', 'M'], ['lg', 'L'], ['xl', 'XL'])),
  space: ch('space', 'Inside space', opts(['tight', 'Tight'], ['normal', 'Normal'], ['roomy', 'Roomy'])),
  underline: ch('underline', 'Underline', opts(['yes', 'Yes'], ['no', 'No'])),
}

// ── Parts ─────────────────────────────────────────────────────────────────

const BOX = ['bg', 'border', 'bw', 'bs', 'radius', 'shadow'] as const
const TEXT = ['color', 'size', 'weight', 'align', 'case', 'letter', 'font'] as const

/**
 * Every part a page block may mark. The id is stored in keys (`p_<id>_<prop>`):
 * never rename one. A block lists the parts it draws in its registry entry.
 */
export const PARTS = [
  { id: 'card', label: 'Card', group: 'Box', props: [...BOX, 'space'] },
  { id: 'title', label: 'Title', group: 'Text', props: TEXT },
  { id: 'subtitle', label: 'Line under the title', group: 'Text', props: TEXT },
  { id: 'text', label: 'Body text', group: 'Text', props: ['color', 'size', 'weight', 'font'] },
  { id: 'muted', label: 'Small print', group: 'Text', props: ['color', 'size', 'weight'] },
  { id: 'option', label: 'Not chosen', group: 'Choices', hint: 'How each choice looks before it is picked.', props: [...BOX, 'color'] },
  { id: 'option_on', label: 'Chosen', group: 'Choices', hint: 'The picked choice.', props: ['bg', 'border', 'bw', 'shadow', 'color'] },
  { id: 'option_hover', label: 'Under the finger / mouse', group: 'Choices', props: ['bg', 'border'] },
  { id: 'option_label', label: 'Choice name', group: 'Choices', props: ['size', 'weight', 'case'] },
  { id: 'option_desc', label: 'Choice description', group: 'Choices', props: ['color', 'size'] },
  { id: 'icon', label: 'Icon (not chosen)', group: 'Choices', props: ['bg', 'icon'] },
  { id: 'icon_on', label: 'Icon (chosen)', group: 'Choices', props: ['bg', 'icon'] },
  { id: 'tick', label: 'Chosen tick', group: 'Choices', props: ['bg', 'icon'] },
  { id: 'field', label: 'Answer boxes', group: 'Form', props: ['bg', 'color', 'border', 'bw', 'radius', 'shadow', 'placeholder', 'focus', 'height'] },
  { id: 'label', label: 'Question labels', group: 'Form', props: ['color', 'size', 'weight', 'case'] },
  { id: 'error', label: 'Mistake messages', group: 'Form', props: ['color'] },
  { id: 'button', label: 'Main button', group: 'Buttons', props: [...BOX, 'color', 'size', 'weight', 'case', 'height'] },
  { id: 'button_alt', label: 'Second buttons', group: 'Buttons', props: ['bg', 'color', 'border', 'bw', 'radius'] },
  { id: 'link', label: 'Links', group: 'Buttons', props: ['color', 'weight', 'underline'] },
  { id: 'divider', label: 'Lines between rows', group: 'Details', props: ['border', 'bw', 'bs'] },
  { id: 'badge', label: 'Badges & chips', group: 'Details', props: ['bg', 'color', 'radius'] },
  { id: 'total', label: 'Total', group: 'Details', props: ['color', 'size', 'weight'] },
  { id: 'price', label: 'Prices', group: 'Details', props: ['color', 'weight'] },
  { id: 'banner', label: 'Banner', group: 'Box', props: ['bg', 'color', 'radius', 'shadow'] },
  { id: 'step', label: 'Steps not reached', group: 'Progress', props: ['bg', 'color'] },
  { id: 'step_on', label: 'Current step', group: 'Progress', props: ['bg', 'color'] },
  { id: 'step_done', label: 'Done steps', group: 'Progress', props: ['bg', 'color'] },
] as const satisfies readonly PartDef[]

export type PartId = (typeof PARTS)[number]['id']

const PART_BY_ID: ReadonlyMap<string, PartDef> = new Map(PARTS.map((p) => [p.id, p as PartDef]))

export function partDef(id: string): PartDef | undefined {
  return PART_BY_ID.get(id)
}

/** Parts every block draws (its card and wording). */
export const SHARED_PARTS: readonly PartId[] = ['card', 'title', 'subtitle', 'text', 'muted']

/** The parts `def` can be styled by, in registry order. */
export function blockParts(def: Pick<PageBlockDef, 'parts'>): PartDef[] {
  const ids = new Set<string>([...SHARED_PARTS, ...(def.parts ?? [])])
  return PARTS.filter((part) => ids.has(part.id))
}

/** The stored key for a part's prop. */
export const partKey = (part: string, prop: string) => `p_${part}_${prop}`

/** Every valid key → [part, prop]. Built once, so keys are never parsed by splitting. */
const KEYS: ReadonlyMap<string, readonly [string, string]> = new Map(
  PARTS.flatMap((part) => part.props.map((prop) => [partKey(part.id, prop), [part.id, prop] as const])),
)

export function isPartKey(key: string): boolean {
  return KEYS.has(key)
}

/** The part a key styles (undefined for any other key). */
export function partOfKey(key: string): string | undefined {
  return KEYS.get(key)?.[0]
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** Whether `value` is a valid stored value for part key `key`. */
export function isValidPartValue(key: string, value: unknown): value is string {
  const entry = KEYS.get(key)
  if (!entry || typeof value !== 'string') return false
  const prop = PART_PROPS[entry[1]]
  if (prop.kind === 'color') return HEX.test(value)
  return !!prop.choices?.some((choice) => choice.value === value)
}

/** The part keys of `values` that hold a valid value, for parts in `allowed` (all when omitted). */
export function partValues(values: Readonly<Record<string, unknown>> | undefined, allowed?: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!values) return out
  for (const [key, value] of Object.entries(values)) {
    const part = partOfKey(key)
    if (!part || (allowed && !allowed.includes(part))) continue
    if (isValidPartValue(key, value)) out[key] = value
  }
  return out
}

// ── CSS ───────────────────────────────────────────────────────────────────

const ON = '[data-on]'
const SELECTORS: Readonly<Record<string, string>> = {
  card: '[data-part="card"]',
  title: '[data-part="title"]',
  subtitle: '[data-part="subtitle"]',
  text: '[data-part="text"]',
  muted: '[data-part="muted"]',
  option: '[data-part="option"]',
  option_on: `[data-part="option"]${ON}`,
  option_hover: `[data-part="option"]:not(${ON}):hover`,
  option_label: '[data-part="option-label"]',
  option_desc: '[data-part="option-desc"]',
  icon: '[data-part="icon"]',
  icon_on: `[data-part="option"]${ON} [data-part="icon"], [data-part="icon"]${ON}`,
  tick: '[data-part="tick"]',
  field: '[data-part="field"]',
  label: '[data-part="label"]',
  error: '[data-part="error"]',
  button: '[data-part="button"]',
  button_alt: '[data-part="button-alt"]',
  link: '[data-part="link"]',
  divider: '[data-part="divider"]',
  badge: '[data-part="badge"]',
  total: '[data-part="total"]',
  price: '[data-part="price"]',
  banner: '[data-part="banner"]',
  step: '[data-part="step"]',
  step_on: '[data-part="step"][data-on]',
  step_done: '[data-part="step"][data-done]',
}

function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}

/** One part's declarations (and `::placeholder` / `:focus` extras) from its validated props. */
function declarations(props: Readonly<Record<string, string>>): { main: string[]; placeholder: string[]; focus: string[] } {
  const main: string[] = []
  const placeholder: string[] = []
  const focus: string[] = []
  const add = (prop: string, value: string | undefined) => {
    if (value !== undefined) main.push(`${prop}:${value} !important`)
  }
  for (const [prop, value] of Object.entries(props)) {
    switch (prop) {
      case 'bg':
        add('background-color', value)
        add('background-image', 'none')
        break
      case 'color':
        add('color', value)
        break
      case 'border':
        add('border-color', value)
        break
      case 'icon':
        add('color', value)
        break
      case 'placeholder':
        placeholder.push(`color:${value} !important`, 'opacity:1 !important')
        break
      case 'focus':
        focus.push(`border-color:${value} !important`, `--tw-ring-color:${value} !important`, `outline-color:${value} !important`)
        break
      case 'bw': {
        const width = own(BORDER_WIDTH, value)
        add('border-width', width)
        // A part drawn without a border needs a style for the width to show.
        if (width && width !== '0px' && !props.bs) add('border-style', 'solid')
        break
      }
      case 'bs':
        add('border-style', own(BORDER_STYLE, value))
        break
      case 'radius':
        add('border-radius', own(RADIUS, value))
        break
      case 'shadow':
        add('box-shadow', own(SHADOW, value))
        break
      case 'size':
        add('font-size', own(TEXT_SIZE, value))
        break
      case 'weight':
        add('font-weight', own(WEIGHT, value))
        break
      case 'align':
        add('text-align', own(ALIGN, value))
        break
      case 'case':
        add('text-transform', own(CASE, value))
        break
      case 'letter':
        add('letter-spacing', own(LETTER, value))
        break
      case 'font':
        add('font-family', own(FONT_OPTIONS, value)?.css)
        break
      case 'height':
        add('min-height', own(HEIGHT, value))
        break
      case 'space':
        add('padding', own(SPACE, value))
        break
      case 'underline':
        add('text-decoration-line', own(UNDERLINE, value))
        break
    }
  }
  return { main, placeholder, focus }
}

/** Dividers are one line (a top border): width and style go on that side only. */
function dividerProps(props: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(props).filter(([prop]) => prop !== 'bw' && prop !== 'bs'))
}

function dividerExtras(props: Readonly<Record<string, string>>): string[] {
  const out: string[] = []
  const width = props.bw ? own(BORDER_WIDTH, props.bw) : undefined
  const style = props.bs ? own(BORDER_STYLE, props.bs) : undefined
  if (width) out.push(`border-top-width:${width} !important`)
  if (style) out.push(`border-top-style:${style} !important`)
  else if (width && width !== '0px') out.push('border-top-style:solid !important')
  return out
}

/**
 * The scoped CSS for a set of part styles. `prefix` is the selector the
 * parts sit under (`.scope` for the page, `.scope .n4` for one block).
 * Only valid keys and values are used; '' when nothing is set.
 */
export function buildPartCss(prefix: string, values: Readonly<Record<string, unknown>> | undefined): string {
  const valid = partValues(values)
  const byPart = new Map<string, Record<string, string>>()
  for (const [key, value] of Object.entries(valid)) {
    const [part, prop] = KEYS.get(key)!
    byPart.set(part, { ...(byPart.get(part) ?? {}), [prop]: value })
  }
  let css = ''
  for (const part of PARTS) {
    const props = byPart.get(part.id)
    if (!props) continue
    const selector = SELECTORS[part.id]
    const scoped = (suffix = '') => selector.split(', ').map((s) => `${prefix} ${s}${suffix}`).join(',')
    const { main, placeholder, focus } = declarations(part.id === 'divider' ? dividerProps(props) : props)
    const extras = part.id === 'divider' ? dividerExtras(props) : []
    if (main.length || extras.length) css += `${scoped()}{${[...main, ...extras].join(';')}}`
    if (placeholder.length) css += `${scoped('::placeholder')},${scoped(' input::placeholder')},${scoped(' textarea::placeholder')}{${placeholder.join(';')}}`
    if (focus.length) css += `${scoped(':focus')},${scoped(':focus-within')}{${focus.join(';')}}`
    // Icons are drawn by an <svg> with its own colour class inside the marked circle.
    if (props.icon) css += `${scoped(' svg')}{color:${props.icon} !important}`
    // A field part may be a wrapper (prefix + input): its typed text is the input's.
    if (part.id === 'field' && props.color) css += `${scoped(' input')},${scoped(' textarea')},${scoped(' select')}{color:${props.color} !important}`
  }
  return css
}

/** Google-font keys the part styles use (so the sheet can load them). */
export function partFonts(values: Readonly<Record<string, unknown>> | undefined): string[] {
  return Object.entries(partValues(values))
    .filter(([key]) => KEYS.get(key)?.[1] === 'font')
    .map(([, value]) => value)
}

// ── Quick styles ──────────────────────────────────────────────────────────

export interface QuickStyle {
  id: string
  label: string
  /** Part values it sets; it clears the box props of the same parts first. */
  values: Readonly<Record<string, string>>
}

/** One-tap starting points for a block (or the whole page). The owner can tweak after. */
export const QUICK_STYLES: readonly QuickStyle[] = [
  { id: 'flat', label: 'Flat', values: { p_card_bw: '0', p_card_shadow: 'none', p_option_shadow: 'none' } },
  { id: 'outlined', label: 'Outlined', values: { p_card_bw: '1', p_card_shadow: 'none', p_option_bw: '1', p_option_shadow: 'none' } },
  { id: 'soft', label: 'Soft shadow', values: { p_card_bw: '0', p_card_shadow: 'lg', p_card_radius: 'xl', p_option_bw: '0', p_option_shadow: 'md' } },
  {
    id: 'bold',
    label: 'Bold',
    values: { p_card_bw: '3', p_card_shadow: 'hard', p_card_radius: 'md', p_option_bw: '2', p_option_shadow: 'hard', p_button_bw: '3', p_button_shadow: 'hard', p_title_weight: '900' },
  },
  { id: 'rounded', label: 'Bubbly', values: { p_card_radius: 'xl', p_option_radius: 'xl', p_field_radius: 'pill', p_button_radius: 'pill', p_badge_radius: 'pill' } },
  { id: 'receipt', label: 'Receipt', values: { p_card_radius: 'none', p_card_shadow: 'none', p_divider_bs: 'dashed', p_text_font: 'mono', p_total_weight: '800' } },
]

/** The part keys a quick style resets before applying (so styles don't pile up). */
const QUICK_RESET_PROPS = new Set(['bw', 'bs', 'radius', 'shadow'])

/** `values` with quick style `style` applied over it (box props of every part reset first). */
export function applyQuickStyle(values: Readonly<Record<string, unknown>>, style: QuickStyle): Record<string, unknown> {
  const kept = Object.fromEntries(
    Object.entries(values).filter(([key]) => {
      const entry = KEYS.get(key)
      return !entry || !QUICK_RESET_PROPS.has(entry[1])
    }),
  )
  return { ...kept, ...style.values }
}

/** `values` without any part key (the block's other settings kept). */
export function withoutParts(values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !isPartKey(key)))
}
