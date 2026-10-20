/**
 * What a stock or cost refusal says (Phase 0d, plan §6.1). Pure, so a Bearer
 * route or a client can import the sentences without the cookie-bound gate.
 *
 * Each names the grant to ask the owner for: the generic "Missing permission
 * for this feature" told a kitchen hand nothing.
 */

import { INGREDIENT_REFUSALS } from '@/lib/inventory/ingredient-write-grants'

export const PERMISSION_REFUSALS = {
  recordStock: 'Recording stock needs the Inventory permission. Ask the store owner to turn it on for you.',
  stockHistory: 'Stock history needs the Inventory permission. Ask the store owner to turn it on for you.',
  reorderLevel: 'Changing a reorder level needs the Inventory permission. Ask the store owner to turn it on for you.',
  counts: 'Stock counts need the Inventory permission. Ask the store owner to turn it on for you.',
  transfers: 'Moving stock between branches needs the Inventory permission. Ask the store owner to turn it on for you.',
  dishCost: 'Dish costs need the Costs & Profit permission. Ask the store owner to turn it on for you.',
} as const

const KNOWN_REFUSALS: ReadonlySet<string> = new Set([
  ...Object.values(PERMISSION_REFUSALS),
  ...Object.values(INGREDIENT_REFUSALS),
])

/**
 * Whether an error message is a permission refusal a merchant should read
 * as-is, rather than an internal failure to hide behind a generic line.
 */
export function isPermissionRefusal(message: string): boolean {
  return message.startsWith('Unauthorized') || KNOWN_REFUSALS.has(message)
}
