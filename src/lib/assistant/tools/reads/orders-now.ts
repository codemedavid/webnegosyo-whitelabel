/**
 * get_orders_now — today's live order queue (new, confirmed, preparing, ready)
 * and today's takings so far, from whichever backend holds the store's orders
 * (`readLiveOrderStats` routes through `resolveOrderBackend`).
 */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { readLiveOrderStats } from '@/lib/dashboard/live-orders'
import { formatCount, formatPeso } from '@/components/admin/dashboard/dashboard-format'
import type { OrderStats } from '@/lib/order-stats'
import type { Tenant } from '@/types/database'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'

const input = z.object({})
type Input = z.infer<typeof input>

export function buildOrdersNowResult(stats: OrderStats | null): ToolResult {
  if (!stats) return { facts: { available: false, reason: "Today's orders could not be read right now." } }
  const waiting = stats.pendingOrders + stats.confirmedOrders + stats.preparingOrders
  return {
    facts: { ...stats, inProgress: waiting, note: 'Today only; cancelled orders are excluded from sales.' },
    card: {
      type: 'stats',
      title: 'Today so far',
      items: [
        { label: 'Orders', value: formatCount(stats.todayOrders) },
        { label: 'Sales', value: formatPeso(stats.todayRevenue) },
        { label: 'New (waiting)', value: formatCount(stats.pendingOrders), hint: `${formatCount(stats.confirmedOrders)} confirmed` },
        { label: 'Preparing', value: formatCount(stats.preparingOrders), hint: `${formatCount(stats.readyOrders)} ready` },
      ],
    },
    chips: [{ label: 'Compare with last week', prompt: 'How were sales this week?' }],
    links: [{ label: 'Open Orders', path: '/orders' }],
  }
}

export const getOrdersNowTool: AssistantToolDef<Input> = {
  name: 'get_orders_now',
  description: "Today's live order queue (new/confirmed/preparing/ready) and today's sales so far.",
  access: { permission: 'orders' },
  input,
  async run(ctx) {
    // The whole row, as the admin dashboard passes it: the backend router reads
    // several credential columns. It stays server-side; only the stats reach the model.
    const { data, error } = await createAdminClient().from('tenants').select('*').eq('id', ctx.tenantId).single()
    if (error || !data) return { facts: { available: false, reason: 'Store settings could not be read.' } }
    return buildOrdersNowResult(await readLiveOrderStats(data as unknown as Tenant))
  },
}
