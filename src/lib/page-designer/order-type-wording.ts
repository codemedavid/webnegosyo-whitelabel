// ---------------------------------------------------------------------------
// The order-type block's own wording and icons: an owner may rename dine-in,
// pickup and delivery, re-word their details and pick another icon AS SHOWN
// ON THE CHECKOUT BLOCK. Display only — the order_types row (and every other
// screen that names the order type) is never touched. Blank = the store's own
// name / description, 'auto' = today's icon.
//
// Only the three core kinds can be re-worded: the database keeps one of each
// per store, so a rename always means exactly one choice. Aggregator kinds
// (grab, foodpanda, other) repeat and keep their own names.
// ---------------------------------------------------------------------------

import type { BlockChoice, BlockOption, BlockTextSlot } from './types'

export const WORDED_KINDS = ['dine_in', 'pickup', 'delivery'] as const
export type WordedKind = (typeof WORDED_KINDS)[number]

/** Every icon an owner may pick for an order type (lucide names, stored in designs — never rename). */
export const ORDER_TYPE_ICON_NAMES = ['Utensils', 'Coffee', 'Armchair', 'Store', 'ShoppingBag', 'Car', 'Bike', 'MapPin', 'Home'] as const
export type OrderTypeIconName = (typeof ORDER_TYPE_ICON_NAMES)[number]

const AUTO: BlockChoice = { value: 'auto', label: 'Auto' }

/** A few icons that suit each kind, today's icon ('auto') first. */
export const ORDER_TYPE_ICON_CHOICES: Readonly<Record<WordedKind, readonly BlockChoice[]>> = {
  dine_in: [AUTO, { value: 'Utensils', label: 'Cutlery' }, { value: 'Coffee', label: 'Cup' }, { value: 'Armchair', label: 'Seat' }, { value: 'Store', label: 'Shop' }],
  pickup: [AUTO, { value: 'ShoppingBag', label: 'Bag' }, { value: 'Store', label: 'Shop' }, { value: 'Car', label: 'Car' }, { value: 'Coffee', label: 'Cup' }],
  delivery: [AUTO, { value: 'Bike', label: 'Bike' }, { value: 'Car', label: 'Car' }, { value: 'MapPin', label: 'Pin' }, { value: 'Home', label: 'Home' }],
}

const KIND_LABEL: Readonly<Record<WordedKind, string>> = { dine_in: 'Dine-in', pickup: 'Pickup', delivery: 'Delivery' }

export const ORDER_TYPE_NAME_MAX = 40
export const ORDER_TYPE_DESC_MAX = 120

/** The block's text slots: a name and a details line per kind (blank = the store's own). */
export const ORDER_TYPE_WORDING_TEXTS: readonly BlockTextSlot[] = WORDED_KINDS.flatMap((kind): BlockTextSlot[] => [
  {
    key: `label_${kind}`,
    label: `${KIND_LABEL[kind]} name`,
    fallback: '',
    maxLength: ORDER_TYPE_NAME_MAX,
    hint: `Blank uses the name you gave ${KIND_LABEL[kind].toLowerCase()} in Order types. Changes this page only.`,
  },
  {
    key: `desc_${kind}`,
    label: `${KIND_LABEL[kind]} details`,
    fallback: '',
    maxLength: ORDER_TYPE_DESC_MAX,
    hint: `Blank uses the description from Order types. Changes this page only.`,
  },
])

/** The block's icon pickers, one per kind ('auto' = today's icon). */
export function orderTypeIconOptions(extra: Pick<BlockOption, 'showWhen'> = {}): BlockOption[] {
  return WORDED_KINDS.map((kind) => ({
    key: `icon_${kind}`,
    label: `${KIND_LABEL[kind]} icon`,
    type: 'choice',
    display: 'segmented',
    group: 'options',
    default: 'auto',
    choices: ORDER_TYPE_ICON_CHOICES[kind],
    ...extra,
  }))
}

export interface OrderTypeWording {
  names: Partial<Record<WordedKind, string>>
  descriptions: Partial<Record<WordedKind, string>>
  icons: Partial<Record<WordedKind, OrderTypeIconName>>
}

export const EMPTY_ORDER_TYPE_WORDING: OrderTypeWording = { names: {}, descriptions: {}, icons: {} }

export function isWordedKind(kind: unknown): kind is WordedKind {
  return typeof kind === 'string' && (WORDED_KINDS as readonly string[]).includes(kind)
}

export function isOrderTypeIconName(value: unknown): value is OrderTypeIconName {
  return typeof value === 'string' && (ORDER_TYPE_ICON_NAMES as readonly string[]).includes(value)
}

interface NamedOrderType {
  type: string
  name: string
  description?: string | null
}

/** The order type's name on this block. */
export function wordedName(ot: NamedOrderType, wording: OrderTypeWording | undefined): string {
  const own = isWordedKind(ot.type) ? wording?.names[ot.type]?.trim() : undefined
  return own || ot.name
}

/** The order type's details on this block (undefined = none). */
export function wordedDescription(ot: NamedOrderType, wording: OrderTypeWording | undefined): string | undefined {
  const own = isWordedKind(ot.type) ? wording?.descriptions[ot.type]?.trim() : undefined
  return own || ot.description || undefined
}

/** The icon the owner picked for this order type, or null = today's icon. */
export function wordedIconName(ot: Pick<NamedOrderType, 'type'>, wording: OrderTypeWording | undefined): OrderTypeIconName | null {
  if (!isWordedKind(ot.type)) return null
  const icon = wording?.icons[ot.type]
  return isOrderTypeIconName(icon) && ORDER_TYPE_ICON_CHOICES[ot.type].some((c) => c.value === icon) ? icon : null
}

/** Reads the wording from a block's texts and options (blank / 'auto' / unknown = the store's own). */
export function readOrderTypeWording(text: (key: string) => string, option: (key: string) => unknown): OrderTypeWording {
  const byKind = <T>(read: (kind: WordedKind) => T | undefined): Partial<Record<WordedKind, T>> =>
    Object.fromEntries(WORDED_KINDS.map((kind) => [kind, read(kind)] as const).filter(([, value]) => value !== undefined))
  const own = (key: string) => text(key).trim() || undefined
  return {
    names: byKind((kind) => own(`label_${kind}`)),
    descriptions: byKind((kind) => own(`desc_${kind}`)),
    icons: byKind((kind) => {
      const icon = option(`icon_${kind}`)
      return isOrderTypeIconName(icon) ? icon : undefined
    }),
  }
}
