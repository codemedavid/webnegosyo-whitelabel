/**
 * The shape `preflightCheckoutStockAction` accepts.
 *
 * The preflight is a public server action: anyone can post to it, and every
 * call reads a store's stock graph on the database every store shares. So the
 * input is held to what the checkout can actually send — ids, whole quantities
 * within the cart's own limits, at most one order's worth of lines — before a
 * single row is read. Anything else gets "no opinion" from the caller; the
 * authoritative guard inside `createOrderAction` still runs on the real order.
 */

import { z } from 'zod'
import type { CartStockLine } from '@/lib/inventory/producible'

/** Same cap as the order itself (price-order-lines refuses more priced lines). */
export const MAX_PREFLIGHT_LINES = 50
/** Matches `MAX_LINE_QUANTITY`. */
const MAX_QUANTITY = 99
/** Far above any real dish's picks; a bound, not a menu rule. */
const MAX_SELECTION_IDS = 50
const MAX_ID_LENGTH = 128
const MAX_LABEL_LENGTH = 200

const selectionIds = z.array(z.string().min(1).max(MAX_ID_LENGTH)).max(MAX_SELECTION_IDS)
const portions = z.number().int().min(1).max(MAX_QUANTITY)

const lineSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  optionIds: selectionIds.optional(),
  addonIds: selectionIds.optional(),
  modifierOptionIds: selectionIds.optional(),
  addonQuantities: z
    .record(z.string().min(1).max(MAX_ID_LENGTH), portions)
    .refine((record) => Object.keys(record).length <= MAX_SELECTION_IDS)
    .optional(),
  optionLabel: z.string().max(MAX_LABEL_LENGTH).optional(),
})

const inputSchema = z.object({
  tenantId: z.string().uuid(),
  lines: z.array(lineSchema).min(1).max(MAX_PREFLIGHT_LINES),
  outletId: z.string().uuid().nullable(),
})

export interface StockPreflightInput {
  tenantId: string
  lines: CartStockLine[]
  outletId: string | null
}

/** The validated input, or null when it is not something the checkout sends. */
export function parseStockPreflightInput(
  tenantId: unknown,
  lines: unknown,
  outletId: unknown,
): StockPreflightInput | null {
  const parsed = inputSchema.safeParse({ tenantId, lines, outletId: outletId ?? null })
  return parsed.success ? parsed.data : null
}
