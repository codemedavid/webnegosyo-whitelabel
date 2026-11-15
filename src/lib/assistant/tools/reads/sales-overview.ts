/**
 * get_sales_overview — the dashboard's KPIs for ANY period (yesterday, last
 * Saturday, Nov 1 – 10, 2 – 5 PM on Tuesday), from whichever backend holds the
 * store's orders (`loadSalesForWindow` → `readTenantSales` routes through
 * `resolveOrderBackend`). Days are the store's business days, the same windows
 * Reports uses (`insights/when.ts`).
 *
 * Figures are the dashboard's: completed sales only (`isCompletedSale`).
 */

import { z } from 'zod'
import { loadSalesForWindow, type AdminDashboardData } from '@/lib/dashboard/load-admin-dashboard'
import { cutoffScheduleFor } from '@/lib/assistant/data/cutoff-schedule'
import { formatCount, formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { resolveWhen, whenFacts, whenFields, type ResolvedWhen } from '@/lib/assistant/insights/when'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const TOP_ITEM_LIMIT = 5

const input = z.object(whenFields)
type Input = z.infer<typeof input>

/** Hours that sold anything, for "what happened around 3 PM" on a single day. */
function hourFacts(data: AdminDashboardData, when: ResolvedWhen) {
  if (when.dayCount !== 1 || !data.overview) return undefined
  return data.overview.hours.filter((row) => row.orders > 0).map((row) => ({ hour: row.label, orders: row.orders, sales: row.sales }))
}

export function buildSalesOverviewResult(data: AdminDashboardData, when: ResolvedWhen, refs: RefBook): ToolResult {
  if (data.failed || !data.overview) {
    return { facts: { available: false, reason: data.notes[0] ?? 'Sales could not be read right now.' } }
  }
  const { kpis, topItems, channels, busiestHour } = data.overview
  const kpi = (key: keyof typeof kpis) => ({ now: kpis[key].current, before: kpis[key].previous, changePct: kpis[key].change })
  const top = (topItems ?? []).slice(0, TOP_ITEM_LIMIT).map((item) => ({
    // Keys are `id:<menu item id>` or `name:<name>` (rankTopItems).
    ref: item.key.startsWith('id:') ? refs.refFor('item', item.key.slice(3)) : null,
    name: item.name,
    qty: item.quantity,
    revenue: item.revenue,
  }))
  const hours = hourFacts(data, when)
  const title = `Sales — ${when.label}${when.isPartial ? ' so far' : ''}`

  return {
    facts: {
      ...whenFacts(when),
      comparedWith: data.compareLabel,
      sales: kpi('sales'),
      orders: kpi('orders'),
      avgOrder: kpi('avgOrder'),
      customers: kpi('customers'),
      topItems: top,
      // `share` is already a percentage (overview.ts).
      channels: channels.slice(0, 3).map((row) => ({ label: row.label, sharePct: Math.round(row.share) })),
      ...(hours ? { byHour: hours } : {}),
      ...(busiestHour && when.dayCount > 1 ? { busiestHour: busiestHour.label } : {}),
      counts: 'Completed sales only; cancelled and unpaid counter orders are left out.',
      notes: data.notes.slice(0, 2),
    },
    card: {
      type: 'stats',
      title,
      subtitle: `vs ${data.compareLabel}`,
      items: [
        { label: 'Sales', value: formatPeso(kpis.sales.current), change: kpis.sales.change },
        { label: 'Orders', value: formatCount(kpis.orders.current), change: kpis.orders.change },
        { label: 'Avg order', value: formatPeso(kpis.avgOrder.current), change: kpis.avgOrder.change },
        { label: 'Customers', value: formatCount(kpis.customers.current), change: kpis.customers.change },
      ],
    },
    chips: [
      { label: 'What sold best?', prompt: `What were my best sellers (${when.label.toLowerCase()})?` },
      { label: 'Who did what?', prompt: `Who gave discounts or cancelled orders (${when.label.toLowerCase()})?` },
      { label: 'Compare with last week', prompt: `Compare ${when.label.toLowerCase()} with the same days last week.` },
    ],
    links: [{ label: 'Open dashboard', path: '' }],
  }
}

export const getSalesOverviewTool: AssistantToolDef<Input> = {
  name: 'get_sales_overview',
  description:
    'Sales, orders, avg order, customers for ANY period or date (yesterday, a weekday, a date range, hours of one day) vs the period before; top items; per-hour for one day. Default last 7 days.',
  access: { permission: 'analytics' },
  input,
  async run(ctx, args) {
    const resolved = resolveWhen(args, Date.now(), await cutoffScheduleFor(ctx))
    if (!resolved.ok) return { facts: { available: false, reason: resolved.error } }
    const { when } = resolved
    const data = await loadSalesForWindow(ctx.tenantId, {
      start: when.start,
      end: when.end,
      previousStart: when.compare.start,
      previousEnd: when.compare.end,
      dayCount: when.dayCount,
      outletId: null,
      compareLabel: when.compare.label,
    })
    return buildSalesOverviewResult(data, when, ctx.refs)
  },
}
