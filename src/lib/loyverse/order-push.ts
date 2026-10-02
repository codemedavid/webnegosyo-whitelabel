/**
 * Builds Loyverse sales receipts (`POST /receipts`) from local orders.
 *
 * Loyverse has no open-ticket API — a pushed order is a COMPLETED sale for
 * reporting/stock purposes, never an incoming order on the register.
 *
 * Resolution relies on the deterministic ids the catalog sync writes into
 * menu_items.modifier_groups: option id `lv-<variant_id>` names a Loyverse
 * variant, `lvm-<modifier_option_id>` a Loyverse modifier option. Order items
 * record selections by NAME, so names are looked up in the item's groups to
 * recover those ids. The base (single-variant) case uses the item map's
 * local_key='' row, supplied by the caller as `baseVariantId`.
 *
 * Best-effort by design: unmappable lines are collected into `unmapped` and
 * the receipt note rather than failing the push.
 */

import type { ModifierGroup, OrderItem } from '@/types/database'
import type { LoyverseConfig } from '@/lib/loyverse/config'
import { loyverseRequest } from '@/lib/loyverse/client'
import { parseModifierOptionId, parseVariantOptionId } from '@/lib/loyverse/option-ids'

export interface LoyverseReceiptCatalogEntry {
  baseVariantId: string | null
  modifierGroups: ModifierGroup[]
}

/** menu_item_id → what receipt building needs to know about it. */
export type LoyverseReceiptCatalog = Record<string, LoyverseReceiptCatalogEntry>

export interface LoyverseReceiptLine {
  variant_id: string
  quantity: number
  price: number
  line_modifiers?: Array<{ modifier_option_id: string }>
  line_note?: string
}

export interface LoyverseReceiptPayload {
  store_id: string
  order?: string
  note?: string
  line_items: LoyverseReceiptLine[]
  /** Required by Loyverse — a receipt without it is rejected outright. */
  payments: Array<{ payment_type_id: string }>
}

export interface LoyverseOrderInput {
  orderNumber?: string
  items: OrderItem[]
}

export interface BuiltLoyverseReceipt {
  receipt: LoyverseReceiptPayload
  unmapped: string[]
}

function selectedValues(item: OrderItem): Set<string> {
  const values = new Set(Object.values(item.variations ?? {}).filter(Boolean))
  if (item.variation) values.add(item.variation)
  return values
}

function findVariantId(entry: LoyverseReceiptCatalogEntry, item: OrderItem): string | null {
  const values = selectedValues(item)
  if (values.size > 0) {
    for (const group of entry.modifierGroups) {
      for (const option of group.options) {
        const variantId = parseVariantOptionId(option.id)
        if (variantId && values.has(option.name)) return variantId
      }
    }
  }
  return entry.baseVariantId
}

function findModifierOptionIds(entry: LoyverseReceiptCatalogEntry, item: OrderItem): string[] {
  // Guard the shape: caller-supplied lines are validated, but a legacy row
  // with a non-array here must not spread a string into characters.
  const names = new Set(Array.isArray(item.addons) ? item.addons : [])
  if (names.size === 0) return []
  const ids: string[] = []
  for (const group of entry.modifierGroups) {
    for (const option of group.options) {
      const optionId = parseModifierOptionId(option.id)
      if (optionId && names.has(option.name)) ids.push(optionId)
    }
  }
  return ids
}

export function buildLoyverseReceipt(
  config: LoyverseConfig,
  order: LoyverseOrderInput,
  catalog: LoyverseReceiptCatalog
): BuiltLoyverseReceipt {
  const lines: LoyverseReceiptLine[] = []
  const unmapped: string[] = []

  for (const item of order.items) {
    const entry = catalog[item.menu_item_id]
    const variantId = entry ? findVariantId(entry, item) : null
    if (!entry || !variantId) {
      unmapped.push(item.menu_item_name)
      continue
    }

    const line: LoyverseReceiptLine = {
      variant_id: variantId,
      quantity: item.quantity,
      price: item.price,
    }
    const modifierIds = findModifierOptionIds(entry, item)
    if (modifierIds.length > 0) {
      line.line_modifiers = modifierIds.map((id) => ({ modifier_option_id: id }))
    }
    if (item.special_instructions) {
      line.line_note = item.special_instructions
    }
    lines.push(line)
  }

  const receipt: LoyverseReceiptPayload = {
    store_id: config.storeId,
    order: order.orderNumber,
    line_items: lines,
    payments: [{ payment_type_id: config.paymentTypeId }],
  }
  if (unmapped.length > 0) {
    receipt.note = `Not in Loyverse catalog: ${unmapped.join(', ')}`
  }

  return { receipt, unmapped }
}

export interface LoyversePushResult {
  success: boolean
  receiptNumber?: string
  unmapped: string[]
  error?: string
}

interface LoyverseReceiptResponse {
  receipt_number?: string
}

/**
 * Sends the receipt. Never throws — order flows must not break because the
 * merchant's POS backend is down.
 */
export async function sendLoyverseReceipt(
  config: LoyverseConfig,
  order: LoyverseOrderInput,
  catalog: LoyverseReceiptCatalog
): Promise<LoyversePushResult> {
  const { receipt, unmapped } = buildLoyverseReceipt(config, order, catalog)
  if (receipt.line_items.length === 0) {
    return { success: false, unmapped, error: 'No order lines are mapped to Loyverse variants' }
  }
  try {
    const response = await loyverseRequest<LoyverseReceiptResponse>(config.accessToken, {
      path: '/receipts',
      method: 'POST',
      body: receipt,
    })
    return { success: true, receiptNumber: response.receipt_number, unmapped }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Loyverse receipt push failed'
    return { success: false, unmapped, error: message }
  }
}
