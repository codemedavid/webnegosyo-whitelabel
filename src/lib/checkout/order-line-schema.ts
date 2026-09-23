/**
 * The boundary schema for the lines `createOrderAction` receives.
 *
 * The action is a public server action, so every line is untrusted JSON until
 * it passes here. The bounds are generous enough that nothing the web checkout
 * builds can fail them (see `useCheckout` and `flattenBundleOrderItems`) — a
 * refusal at this point is invisible behind the optimistic "Order Placed!"
 * screen, so it must only ever fire on a request no real cart produces.
 *
 * Money is validated for SHAPE only. A price that passes is still just a claim:
 * `resolveOrderLinePrice` floors it and the subtotal is always re-derived.
 */

import { z } from 'zod'
import { validateAddonQuantities } from '@/lib/inventory/selection-quantities'
import { MAX_LINE_QUANTITY } from '@/lib/order-line-price-floor'

/**
 * Matches the platform write path's own cap (`MAX_ITEMS` in orders-service),
 * which used to fail the order as LOST — after the confirmation screen — rather
 * than refuse it.
 */
export const MAX_ORDER_LINES = 50
export const MAX_SPECIAL_INSTRUCTIONS_LENGTH = 1000
const MAX_RAW_INSTRUCTIONS_LENGTH = 10_000
const MAX_ID_LENGTH = 200
const MAX_NAME_LENGTH = 500
const MAX_LABEL_LENGTH = 300
const MAX_VARIATION_LENGTH = 2000
const MAX_SELECTIONS = 100

const INVALID_LINE_MESSAGE =
  'We couldn’t read one of the items in your cart. Please remove it, add it again, and retry.'

const id = z.string().min(1).max(MAX_ID_LENGTH)
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => value ?? undefined)

const orderLineSchema = z
  .object({
    menu_item_id: id,
    menu_item_name: z.string().max(MAX_NAME_LENGTH),
    variation: optionalText(MAX_VARIATION_LENGTH),
    addons: z.array(z.string().max(MAX_LABEL_LENGTH)).max(MAX_SELECTIONS).default([]),
    quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
    price: z.number().min(0),
    subtotal: z.number().min(0),
    special_instructions: z
      .string()
      .max(MAX_RAW_INSTRUCTIONS_LENGTH)
      .nullish()
      .transform((value) => (value ? value.slice(0, MAX_SPECIAL_INSTRUCTIONS_LENGTH) : undefined)),
    option_ids: z.array(id).max(MAX_SELECTIONS).optional(),
    addon_ids: z.array(id).max(MAX_SELECTIONS).optional(),
    addon_quantities: z.unknown().optional(),
    isUpsellItem: z.boolean().optional(),
    isBundleItem: z.boolean().optional(),
    bundleId: optionalText(MAX_ID_LENGTH),
    bundleName: optionalText(MAX_LABEL_LENGTH),
    slotName: optionalText(MAX_LABEL_LENGTH),
    presell_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((line) => validateAddonQuantities(line.addon_quantities, line.addon_ids ?? []), {
    path: ['addon_quantities'],
  })
  .transform(({ addon_quantities, ...line }) => ({
    ...line,
    // Rebuilt as a fresh object: `validateAddonQuantities` already refused any
    // prototype key, and nothing downstream shares the caller's reference.
    ...(addon_quantities !== undefined
      ? { addon_quantities: Object.fromEntries(Object.entries(addon_quantities as Record<string, number>)) }
      : {}),
  }))

const orderLinesSchema = z.array(orderLineSchema).min(1).max(MAX_ORDER_LINES)

export type ValidOrderLine = z.infer<typeof orderLineSchema>

export type ParseOrderLinesResult =
  | { ok: true; lines: ValidOrderLine[] }
  | { ok: false; error: string; issues: string[] }

/** Validate the submitted lines. Never throws; `error` is customer copy. */
export function parseOrderLines(raw: unknown): ParseOrderLinesResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'Order must contain at least one item', issues: ['empty'] }
  }
  if (raw.length > MAX_ORDER_LINES) {
    return {
      ok: false,
      error: `An order can hold at most ${MAX_ORDER_LINES} different items. Please split it into two orders.`,
      issues: ['too_many_lines'],
    }
  }

  const parsed = orderLinesSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: INVALID_LINE_MESSAGE,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`),
    }
  }
  return { ok: true, lines: parsed.data }
}
