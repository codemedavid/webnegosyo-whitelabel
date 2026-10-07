/**
 * get_sales_overview — the dashboard's KPIs for a period, from whichever
 * backend holds the store's orders (`loadAdminDashboard` routes through
 * `resolveOrderBackend`).
 */

import { z } from 'zod'
import { loadAdminDashboard, type AdminDashboardData } from '@/lib/dashboard/load-admin-dashboard'
import { formatCount, formatPeso } from '@/components/admin/dashboard/dashboard-format'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const RANGES = ['today', '7d', '30d', '90d'] as const
const RANGE_LABEL: Record<(typeof RANGES)[number], string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
}
const TOP_ITEM_LIMIT = 5

const input = z.object({ range: z.enum(RANGES).describe('Period; default 7d') })
type Input = z.infer<typeof input>

export function buildSalesOverviewResult(data: AdminDashboardData, range: Input['range'], refs: RefBook): ToolResult {
  if (data.failed || !data.overview) {
    return { facts: { available: false, reason: data.notes[0] ?? 'Sales could not be read right now.' } }
  }
  const { kpis, topItems, channels } = data.overview
  const kpi = (key: keyof typeof kpis) => ({ now: kpis[key].current, before: kpis[key].previous, changePct: kpis[key].change })
  const top = (topItems ?? []).slice(0, TOP_ITEM_LIMIT).map((item) => ({
    // Keys are `id:<menu item id>` or `name:<name>` (rankTopItems).
    ref: item.key.startsWith('id:') ? refs.refFor('item', item.key.slice(3)) : null,
    name: item.name,
    qty: item.quantity,
    revenue: item.revenue,
  }))

  return {
    facts: {
      period: RANGE_LABEL[range],
      comparedWith: data.compareLabel,
      sales: kpi('sales'),
      orders: kpi('orders'),
      avgOrder: kpi('avgOrder'),
      customers: kpi('customers'),
      topItems: top,
      // `share` is already a percentage (overview.ts).
      channels: channels.slice(0, 3).map((row) => ({ label: row.label, sharePct: Math.round(row.share) })),
      notes: data.notes.slice(0, 2),
    },
    card: {
      type: 'stats',
      title: `Sales — ${RANGE_LABEL[range]}`,
      subtitle: `vs ${data.compareLabel}`,
      items: [
        { label: 'Sales', value: formatPeso(kpis.sales.current), change: kpis.sales.change },
        { label: 'Orders', value: formatCount(kpis.orders.current), change: kpis.orders.change },
        { label: 'Avg order', value: formatPeso(kpis.avgOrder.current), change: kpis.avgOrder.change },
        { label: 'Customers', value: formatCount(kpis.customers.current), change: kpis.customers.change },
      ],
    },
    chips: [
      { label: 'What sold best?', prompt: `What were my best sellers ${RANGE_LABEL[range].toLowerCase()}?` },
      { label: 'When am I busiest?', prompt: 'What hours are busiest?' },
      { label: 'What isn’t selling?', prompt: 'Which dishes are not selling?' },
    ],
    links: [{ label: 'Open dashboard', path: '' }],
  }
}

export const getSalesOverviewTool: AssistantToolDef<Input> = {
  name: 'get_sales_overview',
  description: 'Sales, orders, avg order, customers vs previous period; top items. Busy times: get_best_times.',
  access: { permission: 'analytics' },
  input,
  async run(ctx, { range }) {
    const data = await loadAdminDashboard(ctx.tenantId, {
      range,
      outletId: null,
      includeOverview: true,
      includeGrowth: false,
    })
    return buildSalesOverviewResult(data, range, ctx.refs)
  },
}
