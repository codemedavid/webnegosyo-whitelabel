// ---------------------------------------------------------------------------
// The design, colour and layout settings of the checkout blocks (other than
// the order type, which lives with its registry entry). Values are stored in
// page designs: a choice value is never renamed once shipped, and the FIRST
// design of every block is the block exactly as it looked before designs
// existed, so a stored design without the key renders as before.
// ---------------------------------------------------------------------------

import { checkoutColorKnobs } from './checkout-colors'
import { choiceKnob, CORNERS_KNOB, designKnob } from './knobs'
import type { BlockChoice, BlockOption } from './types'

interface Choice<T extends string> extends BlockChoice {
  value: T
}

/** The first (standard) value when `value` is not one of `choices`. */
export function choiceOr<T extends string>(choices: readonly { value: T }[], value: unknown): T {
  return choices.find((c) => c.value === value)?.value ?? choices[0].value
}

export const CARD: BlockOption = { key: 'card', label: 'Show on a card', type: 'boolean', default: true }
export const SHOW_SUBTITLE: BlockOption = { key: 'show_subtitle', label: 'Show the line under the title', type: 'boolean', default: true }

const whenVariant = (...values: string[]) => ({ showWhen: { key: 'variant', values } })
/** Card corners only matter while the block sits on a card. */
const CARD_CORNERS: BlockOption = { ...CORNERS_KNOB, label: 'Card corners', showWhen: { key: 'card', values: [true] } }

// ── Page header ────────────────────────────────────────────────────────────

export const HEADER_DESIGNS = [
  { value: 'standard', label: 'Standard', hint: 'Back button beside the title' },
  { value: 'centered', label: 'Centred', hint: 'Title in the middle' },
  { value: 'banner', label: 'Banner', hint: 'On a band of colour' },
  { value: 'compact', label: 'Compact', hint: 'Small, saves room on phones' },
] as const satisfies readonly Choice<string>[]
export type HeaderDesign = (typeof HEADER_DESIGNS)[number]['value']

export const HEADER_OPTIONS: readonly BlockOption[] = [
  designKnob(HEADER_DESIGNS),
  ...checkoutColorKnobs(['color_text']),
  ...checkoutColorKnobs(['color_button', 'color_button_text'], { color_button: 'Band', color_button_text: 'Band text' })
    .map((knob) => ({ ...knob, ...whenVariant('banner') })),
  { key: 'show_back', label: 'Show the back button', type: 'boolean', default: true },
  SHOW_SUBTITLE,
]

// ── Store closed notice ────────────────────────────────────────────────────

export const STORE_CLOSED_DESIGNS = [
  { value: 'soft', label: 'Soft', hint: 'A tinted box' },
  { value: 'card', label: 'Card', hint: 'A plain card with a warning badge' },
  { value: 'outline', label: 'Outline', hint: 'A bold border' },
] as const satisfies readonly Choice<string>[]
export type StoreClosedDesign = (typeof STORE_CLOSED_DESIGNS)[number]['value']

export const STORE_CLOSED_OPTIONS: readonly BlockOption[] = [
  designKnob(STORE_CLOSED_DESIGNS),
  ...checkoutColorKnobs(['color_text']),
  { ...checkoutColorKnobs(['color_card'])[0], ...whenVariant('card', 'outline') },
  CORNERS_KNOB,
]

// ── Schedule ───────────────────────────────────────────────────────────────

export const SCHEDULE_DESIGNS = [
  { value: 'cards', label: 'Cards', hint: 'Now or later, side by side' },
  { value: 'pill', label: 'Pill toggle', hint: 'Both in one bar' },
  { value: 'list', label: 'List', hint: 'Rows with a round tick' },
] as const satisfies readonly Choice<string>[]
export type ScheduleDesign = (typeof SCHEDULE_DESIGNS)[number]['value']

export const SCHEDULE_OPTIONS: readonly BlockOption[] = [
  designKnob(SCHEDULE_DESIGNS),
  ...checkoutColorKnobs(['color_accent', 'color_card', 'color_text', 'color_border'], { color_accent: 'Chosen option', color_card: 'Options' }),
  CORNERS_KNOB,
  CARD,
]

// ── Customer details ───────────────────────────────────────────────────────

export const FIELD_STYLES = [
  { value: 'outlined', label: 'Outlined', hint: 'Boxes with a border' },
  { value: 'filled', label: 'Filled', hint: 'Softly shaded boxes' },
  { value: 'underlined', label: 'Underlined', hint: 'A line under each answer' },
] as const satisfies readonly Choice<string>[]
export type FieldStyle = (typeof FIELD_STYLES)[number]['value']

export const FIELD_COLUMNS = [
  { value: '2', label: '2' },
  { value: '1', label: '1' },
] as const satisfies readonly Choice<string>[]

export const CUSTOMER_OPTIONS: readonly BlockOption[] = [
  designKnob(FIELD_STYLES, 'Field style'),
  ...checkoutColorKnobs(['color_card', 'color_text', 'color_border', 'color_accent'], { color_border: 'Box borders', color_accent: 'While typing' }),
  { ...CORNERS_KNOB, ...whenVariant('outlined', 'filled') },
  choiceKnob('columns', 'Questions side by side (computers)', FIELD_COLUMNS, { hint: 'Phones always show one question per line.' }),
  CARD,
  SHOW_SUBTITLE,
]

// ── Order summary ──────────────────────────────────────────────────────────

export const SUMMARY_DESIGNS = [
  { value: 'standard', label: 'Standard', hint: 'Dishes, then the total' },
  { value: 'receipt', label: 'Receipt', hint: 'Dashed lines, a big total' },
  { value: 'compact', label: 'Compact', hint: 'Tighter rows' },
] as const satisfies readonly Choice<string>[]
export type SummaryDesign = (typeof SUMMARY_DESIGNS)[number]['value']

export const TOTAL_TONES = [
  { value: 'accent', label: 'Highlight' },
  { value: 'text', label: 'Text' },
] as const satisfies readonly Choice<string>[]

export const SUMMARY_OPTIONS: readonly BlockOption[] = [
  designKnob(SUMMARY_DESIGNS),
  ...checkoutColorKnobs(['color_summary', 'color_text', 'color_muted', 'color_accent']),
  choiceKnob('total_color', 'Total colour', TOTAL_TONES),
  CARD_CORNERS,
  CARD,
  SHOW_SUBTITLE,
  { key: 'show_items', label: 'List the dishes', type: 'boolean', default: true },
]

// ── Voucher code ───────────────────────────────────────────────────────────

export const VOUCHER_DESIGNS = [
  { value: 'field', label: 'Open box', hint: 'The code box always shows' },
  { value: 'tucked', label: 'Tucked away', hint: 'A link that opens the box' },
] as const satisfies readonly Choice<string>[]
export type VoucherDesign = (typeof VOUCHER_DESIGNS)[number]['value']

export const VOUCHER_OPTIONS: readonly BlockOption[] = [
  designKnob(VOUCHER_DESIGNS),
  ...checkoutColorKnobs(['color_card', 'color_text', 'color_border', 'color_accent']),
  CARD_CORNERS,
  CARD,
]

// ── Senior / PWD ───────────────────────────────────────────────────────────

export const GOV_DISCOUNT_OPTIONS: readonly BlockOption[] = [
  ...checkoutColorKnobs(['color_card', 'color_text', 'color_border', 'color_accent']),
  CARD_CORNERS,
  CARD,
]

// ── Payment methods ────────────────────────────────────────────────────────

export const PAYMENT_DESIGNS = [
  { value: 'wallet', label: 'Wallet', hint: 'Tiles in a row you can swipe' },
  { value: 'grid', label: 'Grid', hint: 'Every method in view' },
  { value: 'rows', label: 'List', hint: 'One method per row' },
] as const satisfies readonly Choice<string>[]
export type PaymentDesign = (typeof PAYMENT_DESIGNS)[number]['value']

export const PAYMENT_OPTIONS: readonly BlockOption[] = [
  designKnob(PAYMENT_DESIGNS),
  ...checkoutColorKnobs(['color_accent', 'color_card', 'color_text', 'color_border'], { color_accent: 'Chosen method', color_card: 'Methods' }),
  CORNERS_KNOB,
  CARD,
  SHOW_SUBTITLE,
]

// ── Text me offers ─────────────────────────────────────────────────────────

export const SMS_OPT_IN_OPTIONS: readonly BlockOption[] = [
  ...checkoutColorKnobs(['color_accent', 'color_muted'], { color_accent: 'Tick box', color_muted: 'Wording' }),
]

// ── Place order button ─────────────────────────────────────────────────────

export const BUTTON_SHAPES = [
  { value: 'pill', label: 'Pill', hint: 'Fully round ends' },
  { value: 'rounded', label: 'Rounded', hint: 'Softly rounded corners' },
  { value: 'square', label: 'Square', hint: 'Sharp corners' },
] as const satisfies readonly Choice<string>[]
export type ButtonShape = (typeof BUTTON_SHAPES)[number]['value']

export const BUTTON_SIZES = [
  { value: 'regular', label: 'Regular' },
  { value: 'large', label: 'Large' },
] as const satisfies readonly Choice<string>[]

export const BUTTON_WIDTHS = [
  { value: 'full', label: 'Full width' },
  { value: 'auto', label: 'Fit the words' },
] as const satisfies readonly Choice<string>[]

export const PLACE_ORDER_OPTIONS: readonly BlockOption[] = [
  designKnob(BUTTON_SHAPES, 'Button shape'),
  ...checkoutColorKnobs(['color_button', 'color_button_text']),
  choiceKnob('size', 'Button size', BUTTON_SIZES),
  choiceKnob('width', 'Button width', BUTTON_WIDTHS),
  { key: 'show_total', label: 'Show the total on the button', type: 'boolean', default: true },
  { ...CARD, default: false },
]
