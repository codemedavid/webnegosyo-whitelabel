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

import { cornersClass, type CornersChoice } from '@/lib/page-designer/knobs'
import type { FieldStyle } from '@/lib/page-designer/checkout-block-options'

import { CO } from './checkout-theme'

export interface CheckoutFieldsLook {
  style: FieldStyle
  corners: CornersChoice
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
}

/** The look of every answer box in `look` (absent = today's). */
export function fieldStyleSpec(look: CheckoutFieldsLook | undefined): FieldStyleSpec {
  if (!look) return { box: STANDARD_INPUT_CLASS, label: 'above' }
  const corners = cornersClass(look.corners, 'rounded-lg')
  const groupCorners = cornersClass(look.corners, 'rounded-xl')
  switch (look.style) {
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
