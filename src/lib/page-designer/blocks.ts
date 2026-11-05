import { CHECKOUT_BLOCKS, CHECKOUT_STANDARD_ORDER } from './blocks-checkout'
import { CONFIRMATION_BLOCKS, CONFIRMATION_STANDARD_ORDER } from './blocks-confirmation'
import { TRACKING_BLOCKS, TRACKING_STANDARD_ORDER } from './blocks-tracking'
import type { PageBlockDef, PageId } from './types'

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

export function requiredBlocks(page: PageId): readonly PageBlockDef[] {
  return PAGE_BLOCKS[page].filter((b) => b.required)
}
