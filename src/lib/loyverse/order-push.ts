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

const VARIANT_OPTION_PREFIX = 'lv-'
const MODIFIER_OPTION_PREFIX = 'lvm-'
/** Group ids also start with lv- (`lv-group-…`); only leaf option ids name variants. */
const GROUP_ID_PREFIXES = ['lv-group-', 'lvm-group-']

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

function selectedValues(item: OrderItem): string[] {
  const values = Object.values(item.variations ?? {})
  if (item.variation) values.push(item.variation)
  return values.filter(Boolean)
}

function findVariantId(entry: LoyverseReceiptCatalogEntry, item: OrderItem): string | null {
  const values = selectedValues(item)
  for (const group of entry.modifierGroups) {
    for (const option of group.options) {
      const isVariantOption =
        option.id.startsWith(VARIANT_OPTION_PREFIX) &&
        !GROUP_ID_PREFIXES.some((prefix) => option.id.startsWith(prefix)) &&
        !option.id.startsWith(MODIFIER_OPTION_PREFIX)
      if (isVariantOption && values.includes(option.name)) {
        return option.id.slice(VARIANT_OPTION_PREFIX.length)
      }
    }
  }
  return entry.baseVariantId
}

function findModifierOptionIds(entry: LoyverseReceiptCatalogEntry, item: OrderItem): string[] {
  const names = new Set(item.addons ?? [])
  if (names.size === 0) return []
  const ids: string[] = []
  for (const group of entry.modifierGroups) {
    for (const option of group.options) {
      if (option.id.startsWith(MODIFIER_OPTION_PREFIX) && names.has(option.name)) {
        ids.push(option.id.slice(MODIFIER_OPTION_PREFIX.length))
      }
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
