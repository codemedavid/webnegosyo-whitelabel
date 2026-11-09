import { CHECKOUT_BLOCKS, CHECKOUT_STANDARD_ORDER } from './blocks-checkout'
import { CONFIRMATION_BLOCKS, CONFIRMATION_STANDARD_ORDER } from './blocks-confirmation'
import { TRACKING_BLOCKS, TRACKING_STANDARD_ORDER } from './blocks-tracking'
import type { PageBlockDef, PageId, PageNeed, PageNeeds } from './types'

export const PAGE_BLOCKS: Readonly<Record<PageId, readonly PageBlockDef[]>> = {
  tracking: TRACKING_BLOCKS,
  confirmation: CONFIRMATION_BLOCKS,
  checkout: CHECKOUT_BLOCKS,
}

export const STANDARD_ORDER: Readonly<Record<PageId, readonly string[]>> = {
  tracking: TRACKING_STANDARD_ORDER,
  confirmation: CONFIRMATION_STANDARD_ORDER,
  checkout: CHECKOUT_STANDARD_ORDER,
}

const BY_ID: ReadonlyMap<string, PageBlockDef> = new Map(
  Object.values(PAGE_BLOCKS).flatMap((blocks) => blocks.map((b) => [b.id, b] as const)),
)

/** The block definition, or null for an unknown id (old/hand-edited designs). */
export function blockDef(id: unknown): PageBlockDef | null {
  return typeof id === 'string' ? BY_ID.get(id) ?? null : null
}

/** The definition only when the block belongs to `page`. */
export function pageBlockDef(page: PageId, id: unknown): PageBlockDef | null {
  const def = blockDef(id)
  return def && def.page === page ? def : null
}

/** Blocks the page can't do without: the always-required ones, plus removable ones whose need holds. */
export function requiredBlocks(page: PageId, needs: PageNeeds = {}): readonly PageBlockDef[] {
  return PAGE_BLOCKS[page].filter((b) => b.required || (b.neededWhen !== undefined && needs[b.neededWhen] === true))
}

/** Why a removable block may come back, in the owner's words. */
export const NEED_REASONS: Readonly<Record<PageNeed, string>> = {
  order_choice: 'your store offers more than one way to get an order',
  scheduling: 'scheduled (advance) orders are on',
  questions: 'the chosen order type asks a required question',
  payment: 'you have a payment method switched on',
  gov_claims: 'online Senior / PWD claims are switched on',
  kiosk: 'the page runs in kiosk mode',
}
