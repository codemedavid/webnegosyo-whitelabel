/**
 * Which order types the welcome page offers, so the editor previews exactly
 * what customers will see.
 *
 *  - Branch chooser (multi-branch, branch picked before the menu): the modes
 *    at least one active branch fulfils — the tiles narrow the branch list.
 *  - Single store (or branch picked at checkout): the store's own web order
 *    types. A mode with no matching order type is not offered, because
 *    choosing it could not carry forward to checkout.
 */

import { OUTLET_MODE_ORDER, resolveAvailableModes, type ModeCapableOutlet } from '@/lib/outlets/outlet-modes'
import type { OutletOrderMode } from '@/lib/outlets/nearest-outlet'

interface ModeOrderType {
  type: string
  is_enabled?: boolean | null
  available_on_web?: boolean | null
}

export function modesFromOrderTypes(orderTypes: readonly ModeOrderType[]): OutletOrderMode[] {
  const offered = new Set(
    orderTypes.filter((t) => t.is_enabled !== false && t.available_on_web !== false).map((t) => t.type),
  )
  return OUTLET_MODE_ORDER.filter((mode) => offered.has(mode))
}

export interface WelcomeModesInput {
  /** True when the welcome page is the branch chooser's first screen. */
  isBranchChooser: boolean
  outlets: readonly ModeCapableOutlet[]
  orderTypes: readonly ModeOrderType[]
}

export function resolveWelcomeModes({ isBranchChooser, outlets, orderTypes }: WelcomeModesInput): OutletOrderMode[] {
  return isBranchChooser ? resolveAvailableModes(outlets) : modesFromOrderTypes(orderTypes)
}
