/**
 * get_menu_insights — best sellers, slow movers, dishes not selling, and
 * hidden gems (under-ordered dishes that earn well per sale).
 */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchMenuPerformanceForTenantId } from '@/lib/queries/menu-performance'
import { classifyMenu } from '@/lib/menu-engineering-classify'
import { formatCount, formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { readAssistantMenu } from '@/lib/assistant/data/menu'
import { MENU_FOCUSES, selectMenuInsight, type MenuFocus, type MenuInsight } from '@/lib/assistant/insights/menu-insights'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { AssistantChip, ToolResult } from '@/lib/assistant/types'

const input = z.object({
  focus: z.enum(MENU_FOCUSES),
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]).describe('Window; default 30'),
})
type Input = z.infer<typeof input>

const TITLES: Record<MenuFocus, string> = {
  top: 'Best sellers',
  slow: 'Slow movers',
  not_selling: 'Not selling',
  hidden_gems: 'Hidden gems',
}

function chipsFor(focus: MenuFocus, insight: MenuInsight): AssistantChip[] {
  const first = insight.rows[0]?.name
  if (focus === 'not_selling' || focus === 'slow') {
    return [
      ...(first ? [{ label: `Promote ${first}`, prompt: `How can I get more people to order ${first}?` }] : []),
      { label: 'Combo ideas', prompt: 'Suggest a combo that moves my slow dishes.' },
    ]
  }
  if (focus === 'hidden_gems' && first) {
    return [{ label: `Push ${first}`, prompt: `How should I promote ${first}?` }]
  }
  return [
    { label: 'Hidden gems', prompt: 'What are my hidden gems?' },
    { label: 'What isn’t selling?', prompt: 'Which dishes are not selling?' },
  ]
}

export function buildMenuInsightResult(
  focus: MenuFocus,
  days: number,
  insight: MenuInsight,
  extra: { dataSource: string; marginBasis: string | null },
  refs: RefBook,
): ToolResult {
  const rows = insight.rows.map((row) => ({
    ref: row.itemId ? refs.refFor('item', row.itemId) : null,
    name: row.name,
    units: row.units,
    revenue: row.revenue,
    price: row.price,
    ...(row.isNew ? { isNew: true } : {}),
  }))
  return {
    facts: {
      focus,
      window: `last ${days} days`,
      source: extra.dataSource,
      matched: insight.matched,
      items: rows,
      ...(extra.marginBasis === 'price_proxy' && focus === 'hidden_gems'
        ? { caveat: 'Ranked by price, not true margin (no recipe costs).' }
        : {}),
      ...(insight.note ? { note: insight.note } : {}),
    },
    card: {
      type: 'ranked',
      title: TITLES[focus],
      subtitle: `Last ${days} days${insight.matched > insight.rows.length ? ` · top ${insight.rows.length} of ${insight.matched}` : ''}`,
      rows: insight.rows.map((row) => ({
        label: row.name,
        value: focus === 'not_selling' ? (row.price !== null ? formatPeso(row.price) : '—') : formatPeso(row.revenue),
        detail: focus === 'not_selling' ? (row.isNew ? 'New this period' : 'No orders') : `${formatCount(row.units)} sold`,
        ...(row.isNew ? { badge: 'New' } : {}),
      })),
      emptyText: insight.note ?? 'Nothing to show for this period.',
    },
    chips: chipsFor(focus, insight),
    links: [{ label: 'Open Boost Sales', path: '/boost-sales' }],
  }
}

export const getMenuInsightsTool: AssistantToolDef<Input> = {
  name: 'get_menu_insights',
  description: 'Menu performance: top sellers, slow movers, not_selling (0 orders), hidden_gems (high value, low orders).',
  access: { permission: 'analytics' },
  input,
  async run(ctx, { focus, days }) {
    const [menu, performance] = await Promise.all([
      ctx.memo('menu', () => readAssistantMenu(ctx.tenantId)),
      ctx.memo(`perf:${days}`, () => fetchMenuPerformanceForTenantId(ctx.tenantId, { client: createAdminClient() }, days)),
    ])
    const classification =
      focus === 'hidden_gems'
        ? classifyMenu({ items: menu.map((item) => ({ id: item.id, name: item.name, price: item.price, categoryId: item.categoryId })), performance })
        : null
    const insight = selectMenuInsight({ focus, days, menu, performance, classification, now: Date.now() })
    return buildMenuInsightResult(focus, days, insight, { dataSource: performance.dataSource, marginBasis: classification?.marginBasis ?? null }, ctx.refs)
  },
}
