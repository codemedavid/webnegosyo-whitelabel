/**
 * How the checkout's answer boxes look on a Page Designer checkout. Only
 * presentation: the same inputs, the same handlers, the same validation.
 * Colours come from the checkout theme (`--co-*`) only.
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

const FILLED =
  'border border-transparent bg-[var(--co-subtle-strong)] text-[color:var(--co-text)] placeholder:text-[color:var(--co-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--co-accent)] focus:bg-[var(--co-card)]'

// The 2px underline turning the accent colour is the focus cue.
const UNDERLINED =
  'w-full rounded-none border-0 border-b-2 border-[color:var(--co-border)] bg-transparent px-1 py-2.5 text-[color:var(--co-text)] placeholder:text-[color:var(--co-muted)] transition-colors focus:outline-none focus:border-[color:var(--co-accent)]'

/** The class for every answer box in `look` (absent = today's). */
export function fieldInputClass(look: CheckoutFieldsLook | undefined): string {
  if (!look) return STANDARD_INPUT_CLASS
  const corners = cornersClass(look.corners, 'rounded-lg')
  switch (look.style) {
    case 'filled':
      return `w-full px-3 py-2.5 ${corners} transition-shadow ${FILLED}`
    case 'underlined':
      return UNDERLINED
    default:
      return `w-full px-3 py-2.5 ${corners} transition-shadow ${CO.input}`
  }
}
