import { z } from 'zod'
import type { DepletionOrderItem } from '@/lib/inventory/order-depletion'

const id = z.string().min(1).max(200).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value))
const quantities = z.record(id, z.number().int().min(1).max(99))
const line = z.object({
  menuItemId: id,
  quantity: z.number().int().positive().max(9999),
  optionIds: z.array(id).max(1000).default([]),
  addonIds: z.array(id).max(1000).default([]),
  addonQuantities: quantities.optional(),
}).refine(row => Object.keys(row.addonQuantities ?? {}).every(key => row.addonIds.includes(key)))
const snapshotSchema = z.object({ version: z.literal(1), items: z.array(line).max(500) })

export interface InventorySelectionInput {
  menu_item_id: string
  quantity: number
  option_ids?: string[]
  addon_ids?: string[]
  addon_quantities?: Record<string, number>
}

/** Persist in the existing JSON customer-data envelope across all order backends. */
export function buildInventorySelectionSnapshot(items: readonly InventorySelectionInput[]) {
  return snapshotSchema.parse({ version: 1, items: items.map(item => ({
    menuItemId: item.menu_item_id, quantity: item.quantity,
    optionIds: item.option_ids ?? [], addonIds: item.addon_ids ?? [],
    ...(item.addon_quantities ? { addonQuantities: item.addon_quantities } : {}),
  })) })
}

export function readInventorySelectionSnapshot(customerData: unknown, expectedItems?: readonly Pick<DepletionOrderItem, 'menuItemId' | 'quantity'>[]): DepletionOrderItem[] | null {
  if (!customerData || typeof customerData !== 'object') return null
  const parsed = snapshotSchema.safeParse((customerData as Record<string, unknown>)._inventory_selections)
  if (!parsed.success) return null
  if (expectedItems) {
    const keys = (items: readonly Pick<DepletionOrderItem, 'menuItemId' | 'quantity'>[]) => items.map(item => JSON.stringify([item.menuItemId, item.quantity])).sort()
    if (JSON.stringify(keys(parsed.data.items)) !== JSON.stringify(keys(expectedItems))) return null
  }
  return parsed.data.items.map(item => ({ ...item, modifierOptionIds: [...new Set([...item.optionIds, ...item.addonIds])] }))
}

/** Always overwrite caller-supplied metadata with the order's actual input lines. */
export function withInventorySelectionSnapshot(customerData: Record<string, unknown> | undefined, items: readonly InventorySelectionInput[]): Record<string, unknown> {
  const data = { ...customerData }
  delete data._inventory_selections
  if (!items.some(item => item.option_ids?.length || item.addon_ids?.length)) return data
  return { ...data, _inventory_selections: buildInventorySelectionSnapshot(items) }
}
