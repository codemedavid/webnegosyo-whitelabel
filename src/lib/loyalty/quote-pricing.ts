import { isOptionAvailable, normalizeModifierGroups, validateGroupSelection, type ModifierSource } from '@/lib/modifier-groups'
import { computeOrderTotals } from '@/lib/order-totals'
import { getEffectiveItemPrice } from '@/lib/cart-utils'
import type { MenuItem, ModifierGroup, ModifierOption } from '@/types/database'
import { valueLoyaltyReward } from './reward'
import { z } from 'zod'

const identifier = z.string().min(1).max(200)
/** Conservative ceiling keeps every peso/centavo round-trip exact. */
export const MAX_LOYALTY_QUOTE_CENTAVOS = 999_999_999
function validMoney(value: number): boolean {
  const cents = value * 100
  return Number.isFinite(value) && value >= 0 && cents <= MAX_LOYALTY_QUOTE_CENTAVOS
    && Math.abs(cents - Math.round(cents)) <= 1e-6
}
function boundedCentavos(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_LOYALTY_QUOTE_CENTAVOS
}
const cartSchema = z.strictObject({ lines: z.array(z.strictObject({
  menuItemId: identifier,
  quantity: z.number().int().min(1).max(999),
  selectedOptionIds: z.array(identifier).max(1000).refine(ids => new Set(ids).size === ids.length),
})).min(1).max(100) })

/** Only server-loaded, tenant-scoped and outlet-resolved catalog rows belong here.
 * This type is NOT an HTTP input schema or proof of authorization. */
export type LoyaltyPricingCatalogItem = Pick<MenuItem, 'id' | 'name' | 'price' | 'is_available'> & ModifierSource & {
  discounted_price?: number | null
  presell_enabled?: boolean
  is_bundle?: boolean
}
export interface LoyaltyPricedLine {
  menuItemId: string
  name: string
  quantity: number
  baseUnitPriceCentavos: number
  unitPriceCentavos: number
  subtotalCentavos: number
  selectedOptions: { groupId: string; groupName: string; optionId: string; name: string; priceModifierCentavos: number }[]
}
export type LoyaltyCartPricingResult =
  | {
    ok: true
    lines: LoyaltyPricedLine[]
    discount: { label: string; loyaltyProgramId: string; amountCentavos: number }
    totals: { subtotalCentavos: number; discountCentavos: number; grandTotalCentavos: number }
  }
  | { ok: false; reason: string }

type CartLine = z.infer<typeof cartSchema>['lines'][number]
type StockDemand = Map<string, Map<string, number>>
type PricingFailure = Extract<LoyaltyCartPricingResult, { ok: false }>

// Issued terms are persisted JSON. Validate on read as well as at program creation;
// corrupt or historical data must not throw or silently produce a different reward.
const moneySchema = z.number().refine(validMoney)
const termsSchema = z.object({
  programId: identifier,
  programName: z.string().trim().min(1),
  versionNumber: z.number().int().positive(),
  isExclusive: z.boolean(),
  reward: z.discriminatedUnion('type', [
    z.object({ type: z.literal('fixed'), amount: moneySchema.refine(value => value > 0) }),
    z.object({ type: z.literal('percent'), percent: z.number().positive().max(100), maxAmount: moneySchema.nullish() }),
    z.object({ type: z.literal('free_item'), menuItemId: identifier, itemName: z.string().trim().min(1) }),
  ]),
})

function checkStock(itemId: string, options: ModifierOption[], quantity: number, stockDemand: StockDemand): PricingFailure | null {
  const itemDemand = stockDemand.get(itemId) ?? new Map<string, number>()
  stockDemand.set(itemId, itemDemand)
  for (const option of options) {
    if (option.stock_mode === 'recipe') return { ok: false, reason: 'unsupported_item' }
    if (!isOptionAvailable(option)) return { ok: false, reason: 'option_unavailable' }
    if (option.stock_mode !== 'simple') continue
    const demand = (itemDemand.get(option.id) ?? 0) + quantity
    if (!Number.isFinite(option.stock_qty) || demand > (option.stock_qty ?? 0)) {
      return { ok: false, reason: 'option_unavailable' }
    }
    itemDemand.set(option.id, demand)
  }
  return null
}

function snapshotLine(item: LoyaltyPricingCatalogItem, line: CartLine, groups: ModifierGroup[]): LoyaltyPricedLine {
  const selectedOptions = groups.flatMap(group => group.options
    .filter(option => line.selectedOptionIds.includes(option.id))
    .map(option => ({
      groupId: group.id,
      groupName: group.name,
      optionId: option.id,
      name: option.name,
      priceModifierCentavos: Math.round(option.price_modifier * 100),
    })))
  const baseUnitPriceCentavos = Math.round(getEffectiveItemPrice(item) * 100)
  const unitPriceCentavos = baseUnitPriceCentavos + selectedOptions.reduce((sum, option) => sum + option.priceModifierCentavos, 0)
  return {
    menuItemId: item.id, name: item.name, quantity: line.quantity,
    baseUnitPriceCentavos, unitPriceCentavos,
    subtotalCentavos: unitPriceCentavos * line.quantity, selectedOptions,
  }
}

function priceLine(item: LoyaltyPricingCatalogItem, line: CartLine, stockDemand: StockDemand):
  { ok: true; line: LoyaltyPricedLine } | PricingFailure {
    if (item.is_available !== true) return { ok: false, reason: 'item_unavailable' }
    if (item.presell_enabled || item.is_bundle) return { ok: false, reason: 'unsupported_item' }
    if (!validMoney(item.price) || (item.discounted_price != null && !validMoney(item.discounted_price))) return { ok: false, reason: 'invalid_money' }
    const groups = normalizeModifierGroups(item)
    if (new Set(groups.map(group => group.id)).size !== groups.length || groups.some(group =>
      !Number.isSafeInteger(group.min_select) || group.min_select < 0
      || (group.max_select !== null && (!Number.isSafeInteger(group.max_select) || group.max_select < group.min_select))
    )) return { ok: false, reason: 'invalid_catalog' }
    if (groups.some(group => group.options.some(option => option.menu_item_id != null))) return { ok: false, reason: 'unsupported_item' }
    const options = groups.flatMap(group => group.options)
    if (options.some(option => !validMoney(option.price_modifier))) return { ok: false, reason: 'invalid_money' }
    if (new Set(options.map(option => option.id)).size !== options.length) return { ok: false, reason: 'invalid_catalog' }
    if (line.selectedOptionIds.some(id => !options.some(option => option.id === id))) return { ok: false, reason: 'unknown_option' }
    for (const group of groups) {
      if (!validateGroupSelection(group, line.selectedOptionIds.filter(id => group.options.some(option => option.id === id))).valid) return { ok: false, reason: 'invalid_selection' }
    }
    const selected = options.filter(option => line.selectedOptionIds.includes(option.id))
    const stockFailure = checkStock(item.id, selected, line.quantity, stockDemand)
    if (stockFailure) return stockFailure
    const snapshot = snapshotLine(item, line, groups)
    if (!boundedCentavos(snapshot.unitPriceCentavos) || !boundedCentavos(snapshot.subtotalCentavos)) {
      return { ok: false, reason: 'invalid_money' }
    }
    return { ok: true, line: snapshot }
}

/** Prices at most 100 lines, 999 units/line, 1000 options/line, and the exported
 * centavo ceiling. Simple option stock is aggregated across all lines per item.
 * This is a quote, not a stock reservation. Selected recipe options, presell,
 * bundles, linked modifiers and negative price modifiers remain unsupported. */
export function priceLoyaltyCart(
  cart: unknown,
  catalog: readonly LoyaltyPricingCatalogItem[],
  persistedTerms: unknown,
): LoyaltyCartPricingResult {
  const parsed = cartSchema.safeParse(cart)
  if (!parsed.success) return { ok: false, reason: 'invalid_cart' }
  const parsedTerms = termsSchema.safeParse(persistedTerms)
  if (!parsedTerms.success) return { ok: false, reason: 'invalid_reward' }
  const terms = parsedTerms.data
  if (new Set(catalog.map(item => item.id)).size !== catalog.length) return { ok: false, reason: 'invalid_catalog' }
  const baseUnitPrices: Record<string, number> = Object.create(null)
  const lines: LoyaltyPricedLine[] = []
  const stockDemand: StockDemand = new Map()
  for (const line of parsed.data.lines) {
    const item = catalog.find(item => item.id === line.menuItemId)
    if (!item) return { ok: false, reason: 'unknown_item' }
    const result = priceLine(item, line, stockDemand)
    if (!result.ok) return result
    baseUnitPrices[item.id] = result.line.baseUnitPriceCentavos / 100
    lines.push(result.line)
  }
  if (!boundedCentavos(lines.reduce((sum, line) => sum + line.subtotalCentavos, 0))) return { ok: false, reason: 'invalid_money' }
  const reward = valueLoyaltyReward(terms, {
    lines: lines.map((line, index) => ({
      id: String(index), menuItemId: line.menuItemId,
      quantity: line.quantity, subtotal: line.subtotalCentavos / 100,
    })),
    baseUnitPrices,
  })
  if (!reward.ok) return reward
  const totals = computeOrderTotals({ subtotal: lines.reduce((sum, line) => sum + line.subtotalCentavos, 0) / 100, discounts: [reward.line] })
  return {
    ok: true, lines,
    discount: {
      label: reward.line.label, loyaltyProgramId: reward.line.loyaltyProgramId,
      amountCentavos: Math.round(reward.line.amount * 100),
    },
    totals: {
      subtotalCentavos: Math.round(totals.subtotal * 100),
      discountCentavos: Math.round(totals.discountTotal * 100),
      grandTotalCentavos: Math.round(totals.grandTotal * 100),
    },
  }
}
