/**
 * calc_promo_breakeven and suggest_promotions — the economics of a discount,
 * from the store's prices, recipe costs (when inventory costing has them) and
 * real sales.
 */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchMenuPerformanceForTenantId } from '@/lib/queries/menu-performance'
import { getMenuItemCost } from '@/lib/inventory/costing-service'
import { readTenantSales } from '@/lib/dashboard/load-admin-dashboard'
import { DAY_MS, manilaDayStart } from '@/lib/dashboard/periods'
import { isCompletedSale, type SaleRecord } from '@/lib/dashboard/sale-record'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { loadCustomerHubOverview } from '@/lib/customers/load-hub-overview'
import { hasPermission } from '@/lib/staff-permissions'
import { readAssistantMenu, type AssistantMenuItem } from '@/lib/assistant/data/menu'
import { computeBreakeven, DEFAULT_FOOD_COST_PCT, type BreakevenLine, type CostedItem } from '@/lib/assistant/insights/breakeven'
import { buildPromoIdeas, PROMO_GOALS, type PromoFacts } from '@/lib/assistant/insights/promotions'
import { buildTimeProfile } from '@/lib/assistant/insights/best-times'
import { selectMenuInsight } from '@/lib/assistant/insights/menu-insights'
import type { AssistantToolContext, AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'

const WINDOW_DAYS = 30

async function unitCost(tenantId: string, itemId: string): Promise<number | null> {
  try {
    const breakdown = await getMenuItemCost(tenantId, itemId)
    return breakdown.baseCost !== null && breakdown.baseCost > 0 ? breakdown.baseCost : null
  } catch {
    return null
  }
}

async function costed(ctx: AssistantToolContext, items: readonly AssistantMenuItem[]): Promise<CostedItem[]> {
  const performance = await ctx.memo(`perf:${WINDOW_DAYS}`, () =>
    fetchMenuPerformanceForTenantId(ctx.tenantId, { client: createAdminClient() }, WINDOW_DAYS),
  )
  const units = new Map(performance.items.flatMap((row) => (row.itemId ? [[row.itemId, row.units] as const] : [])))
  const costs = await Promise.all(items.map((item) => unitCost(ctx.tenantId, item.id)))
  return items.map((item, index) => ({
    name: item.name,
    price: item.price,
    unitCost: costs[index],
    unitsSold: performance.coverage.complete ? (units.get(item.id) ?? 0) : null,
  }))
}

function lineSummary(line: BreakevenLine): string {
  if (line.losesMoney) return `loses money on every sale at ${formatPeso(line.promoPrice)}`
  const units = line.unitsNow !== null && line.unitsNeeded !== null ? ` (${line.unitsNow} → ${line.unitsNeeded}/month)` : ''
  return `needs ${line.requiredLiftPct}% more sales${units}`
}

// ---- calc_promo_breakeven ---------------------------------------------------

const breakevenInput = z.object({
  items: z.array(z.string()).min(1).max(5).describe('Item refs'),
  promo: z.object({
    kind: z.enum(['percent_off', 'amount_off', 'combo_price']),
    value: z.number().positive().max(100_000).describe('Percent, pesos off, or the combo price'),
  }),
})
type BreakevenInput = z.infer<typeof breakevenInput>

export function buildBreakevenResult(lines: readonly BreakevenLine[]): ToolResult {
  const assumed = lines.some((line) => line.costBasis === 'assumed')
  return {
    facts: {
      lines: lines.map((line) => ({ ...line })),
      ...(assumed ? { caveat: `Food cost assumed at ${DEFAULT_FOOD_COST_PCT}% of price where no recipe cost exists.` } : {}),
    },
    card: {
      type: 'ranked',
      title: 'Break-even',
      subtitle: assumed ? `Food cost assumed at ${DEFAULT_FOOD_COST_PCT}% where no recipe is costed` : 'Using your recipe costs',
      rows: lines.map((line) => ({
        label: `${line.name}: ${formatPeso(line.regularPrice)} → ${formatPeso(line.promoPrice)}`,
        value: line.losesMoney ? 'Loses money' : `+${line.requiredLiftPct}%`,
        detail: `Margin ${formatPeso(line.marginBefore)} → ${formatPeso(line.marginAfter)} · ${lineSummary(line)}`,
        badge: line.losesMoney ? 'Stop' : undefined,
      })),
    },
  }
}

export const calcPromoBreakevenTool: AssistantToolDef<BreakevenInput> = {
  name: 'calc_promo_breakeven',
  description: 'Break-even for a discount on dishes (percent_off/amount_off) or a combo price: extra sales needed.',
  access: { permission: 'analytics' },
  input: breakevenInput,
  async run(ctx, { items, promo }) {
    const menu = await ctx.memo('menu', () => readAssistantMenu(ctx.tenantId))
    const byId = new Map(menu.map((item) => [item.id, item]))
    const chosen = items.map((ref) => byId.get(ctx.refs.resolve(ref, 'item') ?? ''))
    if (chosen.some((item) => !item)) return { facts: { error: 'Unknown item ref. Use search_menu first.' } }
    if (promo.kind === 'percent_off' && promo.value >= 100) return { facts: { error: 'Percent must be below 100.' } }
    const lines = computeBreakeven(await costed(ctx, chosen as AssistantMenuItem[]), promo)
    return buildBreakevenResult(lines)
  },
}

// ---- suggest_promotions -------------------------------------------------------

const promoInput = z.object({ goal: z.enum(PROMO_GOALS) })
type PromoInput = z.infer<typeof promoInput>

/** A failed read contributes nothing rather than zeros. */
function read(result: { sales: SaleRecord[]; failed: boolean }): SaleRecord[] {
  return result.failed ? [] : result.sales
}

async function gatherFacts(ctx: AssistantToolContext): Promise<PromoFacts> {
  const now = Date.now()
  const startMs = manilaDayStart(now) - (WINDOW_DAYS - 1) * DAY_MS
  const [menu, performance, sales] = await Promise.all([
    ctx.memo('menu', () => readAssistantMenu(ctx.tenantId)),
    ctx.memo(`perf:${WINDOW_DAYS}`, () => fetchMenuPerformanceForTenantId(ctx.tenantId, { client: createAdminClient() }, WINDOW_DAYS)),
    ctx.memo(`sales:${WINDOW_DAYS}`, () =>
      readTenantSales(ctx.tenantId, { readStart: startMs, currentStart: startMs, now, outletId: null, includeItems: false, includePriorVisits: false }),
    ),
  ])
  const pick = (focus: 'top' | 'slow' | 'not_selling') =>
    selectMenuInsight({ focus, days: WINDOW_DAYS, menu, performance, classification: null, now }).rows
  const byId = new Map(menu.map((item) => [item.id, item]))
  const topRow = pick('top').find((row) => row.itemId && byId.get(row.itemId)?.isAvailable)
  const slowRows = [...pick('not_selling').filter((row) => !row.isNew), ...pick('slow')].slice(0, 2)
  const asItems = async (ids: Array<string | null>) =>
    costed(ctx, ids.flatMap((id) => (id && byId.get(id) ? [byId.get(id) as AssistantMenuItem] : [])))

  const [bestList, slowList] = await Promise.all([asItems([topRow?.itemId ?? null]), asItems(slowRows.map((row) => row.itemId))])
  const completed = read(sales).filter(isCompletedSale)
  const hours = buildTimeProfile(read(sales), { by: 'hour', startMs, endMs: now + 1 })
  const days = buildTimeProfile(read(sales), { by: 'weekday', startMs, endMs: now + 1 })

  let slippingRegulars: number | null = null
  if (ctx.flags.customerHubOn && hasPermission(ctx.caller, 'customers')) {
    const load = await ctx.memo('customers', () => loadCustomerHubOverview(ctx.tenantId, { windowDays: 90, outletId: null }))
    slippingRegulars = load.ok ? load.overview.dashboard.slipping : null
  }

  return {
    bestSeller: bestList[0] ?? null,
    slowDishes: slowList,
    quietestHour: hours.quietest?.label ?? null,
    quietestDay: days.quietest?.label ?? null,
    avgOrderValue: completed.length > 0 ? completed.reduce((sum, sale) => sum + sale.total, 0) / completed.length : null,
    slippingRegulars,
  }
}

export const suggestPromotionsTool: AssistantToolDef<PromoInput> = {
  name: 'suggest_promotions',
  description: 'Promotion ideas for a goal, each grounded in store data with break-even. Present 1-3.',
  access: { permission: 'analytics' },
  input: promoInput,
  async run(ctx, { goal }) {
    const ideas = buildPromoIdeas(goal, await gatherFacts(ctx))
    return {
      facts: {
        goal,
        ideas: ideas.map((idea) => ({
          title: idea.title,
          why: idea.why,
          mechanic: idea.mechanic,
          breakeven: idea.breakeven ? lineSummary(idea.breakeven) : null,
          costBasis: idea.breakeven?.costBasis ?? null,
        })),
        ...(ideas.length === 0 ? { note: 'Not enough sales data to ground a promotion for this goal yet.' } : {}),
      },
      card: {
        type: 'ranked',
        title: 'Promotion ideas',
        rows: ideas.map((idea) => ({ label: idea.title, value: '', detail: `${idea.mechanic}${idea.breakeven ? ` · ${lineSummary(idea.breakeven)}` : ''}` })),
        emptyText: 'Not enough sales yet to suggest a grounded promotion.',
      },
      chips: ideas.slice(0, 3).map((idea) => ({ label: idea.title.length > 28 ? `${idea.title.slice(0, 27)}…` : idea.title, prompt: idea.nextPrompt })),
    }
  },
}
