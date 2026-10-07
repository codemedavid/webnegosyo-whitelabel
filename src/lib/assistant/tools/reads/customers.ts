/**
 * get_customers — repeat rate, new vs returning, who is slipping, and the best
 * customers. The model sees masked names only; phones never leave the server.
 */

import { z } from 'zod'
import { loadCustomerHubOverview } from '@/lib/customers/load-hub-overview'
import type { CustomerHubOverview } from '@/lib/customer-hub-overview'
import { formatCount, formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { maskCustomerName } from '@/lib/assistant/insights/customer-label'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const TOP_LIMIT = 8
const HISTORY_DAYS = 90

const input = z.object({ view: z.enum(['overview', 'best']), days: z.union([z.literal(7), z.literal(30), z.literal(90)]).describe('Default 30') })
type Input = z.infer<typeof input>

function pct(value: number): number {
  return Math.round(value * 1000) / 10
}

export function buildCustomersResult(overview: CustomerHubOverview, view: Input['view'], days: Input['days'], refs: RefBook): ToolResult {
  const window = overview.dashboard.windows.find((w) => w.days === days) ?? overview.dashboard.windows[0]
  if (!window) return { facts: { available: false, reason: 'No customer history yet.' } }
  const coverage = overview.coverage.complete ? {} : { caveat: 'Only orders with a name or number are counted.' }

  if (view === 'best') {
    const top = window.topCustomers.slice(0, TOP_LIMIT)
    return {
      facts: {
        window: `last ${window.days} days`,
        customers: top.map((customer) => ({
          ref: refs.refFor('customer', customer.customerId ?? customer.key),
          name: maskCustomerName(customer.name),
          visits: customer.visits,
          spend: customer.spend,
          lastVisit: customer.lastVisitAt.slice(0, 10),
        })),
        ...coverage,
      },
      card: {
        type: 'ranked',
        title: 'Best customers',
        subtitle: `Last ${window.days} days`,
        rows: top.map((customer) => ({
          label: customer.name ?? (customer.phoneTail ? `Guest ••${customer.phoneTail}` : 'Guest'),
          value: formatPeso(customer.spend),
          detail: `${customer.visits} visit${customer.visits === 1 ? '' : 's'}`,
        })),
        emptyText: 'No named customers in this period.',
      },
      chips: [{ label: 'Who’s slipping?', prompt: 'How many regulars are slipping away?' }],
      links: [{ label: 'Open Customers', path: '/customers' }],
    }
  }

  return {
    facts: {
      window: `last ${window.days} days`,
      customers: window.customers,
      newCustomers: window.newCustomers,
      returningCustomers: window.returningCustomers,
      repeatRatePct: pct(window.repeatRate),
      previousRepeatRatePct: pct(window.previousRepeatRate),
      oneTimers: window.oneTimers,
      slippingRegulars: overview.dashboard.slipping,
      lapsedRegulars: overview.dashboard.lapsed,
      lifetimeValue: overview.dashboard.lifetimeValue,
      revenueSplit: window.revenue,
      ...coverage,
    },
    card: {
      type: 'stats',
      title: 'Your customers',
      subtitle: `Last ${window.days} days`,
      items: [
        { label: 'Customers', value: formatCount(window.customers) },
        { label: 'Came back', value: `${pct(window.repeatRate)}%`, change: Math.round(pct(window.repeatRate) - pct(window.previousRepeatRate)) },
        { label: 'First-timers', value: formatCount(window.newCustomers) },
        { label: 'Slipping regulars', value: formatCount(overview.dashboard.slipping), hint: `${formatCount(overview.dashboard.lapsed)} lapsed` },
      ],
    },
    chips: [
      { label: 'Best customers', prompt: 'Who are my best customers?' },
      { label: 'Win them back', prompt: 'How do I win back my slipping regulars?' },
    ],
    links: [{ label: 'Open Customers', path: '/customers' }],
  }
}

export const getCustomersTool: AssistantToolDef<Input> = {
  name: 'get_customers',
  description: 'Customer overview (repeat rate, new vs returning, slipping/lapsed) or best customers.',
  access: { permission: 'customers' },
  isAvailable: (flags) => flags.customerHubOn,
  input,
  async run(ctx, { view, days }) {
    const load = await ctx.memo('customers', () => loadCustomerHubOverview(ctx.tenantId, { windowDays: HISTORY_DAYS, outletId: null }))
    if (!load.ok) return { facts: { available: false, reason: load.error } }
    return buildCustomersResult(load.overview, view, days, ctx.refs)
  },
}
