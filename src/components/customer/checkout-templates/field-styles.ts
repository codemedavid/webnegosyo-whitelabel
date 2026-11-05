/**
 * How the checkout's answer boxes look on a Page Designer checkout. Only
 * presentation: the same inputs, the same handlers, the same validation.
 * Colours come from the checkout theme (`--co-*`) only.
 *
 * A style is a box (the input's own class — the address field takes it too),
 * where the question's label sits, and for the list styles (inset, joined)
 * the group and rows the questions sit in. The label never disappears: a
 * floating label moves, it is never replaced by the placeholder.
 */

import type { AddressMapChoice } from '@/lib/checkout/address-map'
import { cornersClass, type CornersChoice } from '@/lib/page-designer/knobs'
import type { FieldStyle } from '@/lib/page-designer/checkout-block-options'

import { CO } from './checkout-theme'

export interface CheckoutFieldsLook {
  style: FieldStyle
  corners: CornersChoice
  /** How the delivery address offers the map; absent = the buttons. */
  addressMap?: AddressMapChoice
  /** `tucked` = unit, landmark and rider note wait behind a link. */
  addressDetails?: 'open' | 'tucked'
  /** `optional` = "(optional)" on the optional questions instead of a star on the required ones. */
  marks?: 'stars' | 'optional'
}

/** Today's answer box (also the `outlined` style with standard corners). */
export const STANDARD_INPUT_CLASS = `w-full px-3 py-2.5 rounded-lg transition-shadow ${CO.input}`

const TEXT = 'text-[color:var(--co-text)] placeholder:text-[color:var(--co-muted)]'
const ACCENT_RING = 'focus:outline-none focus:ring-2 focus:ring-[color:var(--co-accent)]'

const FILLED =
  'border border-transparent bg-[var(--co-subtle-strong)] text-[color:var(--co-text)] placeholder:text-[color:var(--co-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--co-accent)] focus:bg-[var(--co-card)]'

// The 2px underline turning the accent colour is the focus cue.
const UNDERLINED =
  'w-full rounded-none border-0 border-b-2 border-[color:var(--co-border)] bg-transparent px-1 py-2.5 text-[color:var(--co-text)] placeholder:text-[color:var(--co-muted)] transition-colors focus:outline-none focus:border-[color:var(--co-accent)]'

/** A box with no frame of its own: the row or cell it sits in is the frame (inset, joined). */
const BARE = `w-full min-w-0 border-0 bg-transparent px-0 ${TEXT} focus:outline-none`

// Lifts on focus: the shadow grows and the box rises a little.
const ELEVATED = `border-0 bg-[var(--co-card)] ${TEXT} shadow-sm transition-[box-shadow,transform] focus:-translate-y-0.5 focus:shadow-lg ${ACCENT_RING}`

// The ink border's offset shadow is pressed away on focus.
const CHUNKY = `border-2 border-[color:var(--co-text)] bg-[var(--co-card)] ${TEXT} shadow-[3px_3px_0_0_var(--co-text)] transition-[box-shadow,transform] focus:translate-x-[3px] focus:translate-y-[3px] focus:shadow-none focus:outline-none focus:border-[color:var(--co-accent)]`

// The newer designs draw their lines from the TEXT colour, never the store's
// border colour: a strong brand border on every box is what made a form look
// shouty. The accent appears only on the box being typed in.
const LINE = 'border-[color:color-mix(in_srgb,var(--co-text)_16%,transparent)]'
const LINE_HOVER = 'hover:border-[color:color-mix(in_srgb,var(--co-text)_30%,transparent)]'
const SOFT_FOCUS = 'focus:outline-none focus:border-[color:var(--co-accent)] focus:ring-[3px] focus:ring-[color:color-mix(in_srgb,var(--co-accent)_22%,transparent)]'
const WITHIN_FOCUS = 'focus-within:border-[color:var(--co-accent)] focus-within:ring-[3px] focus-within:ring-[color:color-mix(in_srgb,var(--co-accent)_22%,transparent)]'
const SHADE = 'bg-[color:color-mix(in_srgb,var(--co-text)_5%,var(--co-card))]'
/** 16px: anything smaller makes iOS zoom the page on focus. */
const FIELD_TEXT = `text-base ${TEXT}`
const QUIET_LABEL = 'block text-[13px] font-medium mb-1.5 text-[color:var(--co-text)]'
const INSIDE_LABEL = 'block text-xs font-medium text-[color:var(--co-muted)]'
const BARE_FIELD = `w-full min-w-0 border-0 bg-transparent p-0 ${FIELD_TEXT} focus:outline-none`

/** Where a question's label sits. */
export type FieldLabelPlacement = 'above' | 'floating' | 'inset' | 'joined' | 'kiosk'

export interface FieldStyleSpec {
  /** The answer box (inputs, selects, the address field). */
  box: string
  /** A textarea's box when it differs from `box`. */
  textareaBox?: string
  label: FieldLabelPlacement
  /** Floating: what a text-like box adds so its label fits inside. */
  floatBox?: string
  /** Inset / joined: the one rounded group all the questions sit in, and each question's row. */
  group?: string
  row?: string
  /** Pill: a leading icon picked by the question's kind. */
  hasIcon?: boolean
  /** The label's class when it differs from the placement's standard one. */
  labelClass?: string
  /** Label inside: the frame each question draws around its label and answer. */
  cell?: string
  /** The delivery address's boxes, when `box` needs a frame around it to read as a box. */
  addressBox?: string
  /** The address's label and its detail labels, when they sit outside a box unlike the other labels. */
  addressLabelClass?: string
  /** `box` has no padding of its own, so the +63 sits flush with the label. */
  isBare?: boolean
}

/** The look of every answer box in `look` (absent = today's). */
export function fieldStyleSpec(look: CheckoutFieldsLook | undefined): FieldStyleSpec {
  if (!look) return { box: STANDARD_INPUT_CLASS, label: 'above' }
  const corners = cornersClass(look.corners, 'rounded-lg')
  const groupCorners = cornersClass(look.corners, 'rounded-xl')
  switch (look.style) {
    case 'clean': {
      const box = `w-full min-h-12 border bg-[var(--co-card)] px-3.5 py-3 ${cornersClass(look.corners, 'rounded-[10px]')} ${LINE} ${LINE_HOVER} ${FIELD_TEXT} transition-[border-color,box-shadow] ${SOFT_FOCUS}`
      return { box, label: 'above', labelClass: QUIET_LABEL }
    }
    case 'label_inside':
      return {
        box: BARE_FIELD,
        label: 'joined',
        labelClass: `${INSIDE_LABEL} mb-0.5`,
        addressLabelClass: QUIET_LABEL,
        cell: `border bg-[var(--co-card)] px-3.5 pb-2 pt-2.5 ${cornersClass(look.corners, 'rounded-xl')} ${LINE} ${LINE_HOVER} transition-[border-color,box-shadow] ${WITHIN_FOCUS}`,
        addressBox: `w-full min-h-12 border bg-[var(--co-card)] px-3.5 py-3 ${cornersClass(look.corners, 'rounded-xl')} ${LINE} ${LINE_HOVER} ${FIELD_TEXT} transition-[border-color,box-shadow] ${SOFT_FOCUS}`,
        isBare: true,
      }
    case 'sheet':
      return {
        box: BARE_FIELD,
        label: 'joined',
        labelClass: `${INSIDE_LABEL} mb-0.5`,
        addressLabelClass: `${INSIDE_LABEL} mb-1.5`,
        group: `overflow-hidden ${cornersClass(look.corners, 'rounded-2xl')} ${SHADE}`,
        row: `border-t px-4 py-3 first:border-t-0 ${LINE} transition-colors focus-within:bg-[var(--co-card)]`,
        addressBox: `w-full min-h-12 rounded-lg border bg-[var(--co-card)] px-3 py-3 ${LINE} ${FIELD_TEXT} transition-[border-color,box-shadow] ${SOFT_FOCUS}`,
        isBare: true,
      }
    case 'ruled':
      return {
        box: `w-full rounded-none border-0 border-b bg-transparent px-0 py-2.5 ${LINE} ${FIELD_TEXT} transition-[border-color,box-shadow] focus:outline-none focus:border-[color:var(--co-accent)] focus:shadow-[0_1px_0_0_var(--co-accent)]`,
        label: 'above',
        labelClass: 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--co-muted)]',
      }
    case 'tinted': {
      const box = `w-full min-h-12 border-0 border-b-2 px-3.5 py-3 ${cornersClass(look.corners, 'rounded-t-lg rounded-b-none')} ${SHADE} ${LINE} ${FIELD_TEXT} transition-colors focus:outline-none focus:border-[color:var(--co-accent)]`
      return { box, label: 'above', labelClass: QUIET_LABEL }
    }
    case 'roomy':
      return {
        box: `w-full min-h-14 border-2 bg-[var(--co-card)] px-4 py-3.5 ${cornersClass(look.corners, 'rounded-xl')} ${LINE} ${LINE_HOVER} text-[17px] ${TEXT} transition-[border-color,box-shadow] ${SOFT_FOCUS}`,
        label: 'above',
        labelClass: 'block text-[15px] font-semibold mb-2 text-[color:var(--co-text)]',
      }
    case 'filled':
      return { box: `w-full px-3 py-2.5 ${corners} transition-shadow ${FILLED}`, label: 'above' }
    case 'underlined':
      return { box: UNDERLINED, label: 'above' }
    case 'floating':
      return {
        box: `w-full px-3 py-2.5 ${corners} transition-shadow ${CO.input}`,
        label: 'floating',
        floatBox: 'pt-6 pb-2 placeholder:text-transparent focus:placeholder:text-[color:var(--co-muted)]',
      }
    case 'floating_filled':
      return {
        box: `w-full px-3 py-2.5 ${corners} transition-shadow ${FILLED}`,
        label: 'floating',
        floatBox: 'pt-6 pb-2 placeholder:text-transparent focus:placeholder:text-[color:var(--co-muted)]',
      }
    case 'inset':
      return {
        box: `${BARE} py-3`,
        label: 'inset',
        group: `overflow-hidden border border-[color:var(--co-border)] bg-[var(--co-card)] ${groupCorners}`,
        row: 'border-t border-[color:var(--co-border)] px-3 first:border-t-0 focus-within:bg-[var(--co-subtle)]',
      }
    case 'joined':
      return {
        box: `${BARE} py-1`,
        label: 'joined',
        group: `overflow-hidden border border-[color:var(--co-border)] bg-[var(--co-card)] ${groupCorners}`,
        row: 'border-t border-[color:var(--co-border)] px-3 pb-2 pt-2.5 first:border-t-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[color:var(--co-accent)]',
      }
    case 'pill':
      return {
        box: `w-full h-12 rounded-full border border-[color:var(--co-border)] bg-[var(--co-card)] px-4 ${TEXT} transition-shadow ${ACCENT_RING}`,
        textareaBox: `w-full rounded-3xl border border-[color:var(--co-border)] bg-[var(--co-card)] px-4 py-3 ${TEXT} transition-shadow ${ACCENT_RING}`,
        label: 'above',
        hasIcon: true,
      }
    case 'elevated':
      return { box: `w-full px-3 py-2.5 ${corners} ${ELEVATED}`, label: 'above' }
    case 'chunky':
      return { box: `w-full px-3 py-2.5 ${corners} ${CHUNKY}`, label: 'above' }
    case 'kiosk':
      return {
        box: `w-full h-16 px-4 text-xl ${cornersClass(look.corners, 'rounded-xl')} border-2 border-[color:var(--co-border)] bg-[var(--co-card)] ${TEXT} transition-shadow ${ACCENT_RING} focus:border-[color:var(--co-accent)]`,
        textareaBox: `w-full min-h-32 px-4 py-3 text-xl ${cornersClass(look.corners, 'rounded-xl')} border-2 border-[color:var(--co-border)] bg-[var(--co-card)] ${TEXT} transition-shadow ${ACCENT_RING} focus:border-[color:var(--co-accent)]`,
        label: 'kiosk',
      }
    default:
      return { box: `w-full px-3 py-2.5 ${corners} transition-shadow ${CO.input}`, label: 'above' }
  }
}

/** The class for every answer box in `look` (absent = today's). The address field takes it too. */
export function fieldInputClass(look: CheckoutFieldsLook | undefined): string {
  return fieldStyleSpec(look).box
}
