/**
 * get_best_times — busiest and quietest hours or weekdays, from the store's
 * real order backend (`readTenantSales`, the dashboard's reader).
 */

import { z } from 'zod'
import { readTenantSales } from '@/lib/dashboard/load-admin-dashboard'
import { DAY_MS, manilaDayStart } from '@/lib/dashboard/periods'
import { formatCount } from '@/components/admin/dashboard/dashboard-format'
import { buildTimeProfile, type TimeGrouping, type TimeProfile } from '@/lib/assistant/insights/best-times'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'

const input = z.object({
  by: z.enum(['hour', 'weekday']),
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]).describe('Window; default 30'),
})
type Input = z.infer<typeof input>

export function buildBestTimesResult(profile: TimeProfile, days: number, by: TimeGrouping): ToolResult {
  const unit = by === 'hour' ? 'orders in that hour (total)' : 'orders per day (average)'
  const ranked = profile.slots.filter((slot) => slot.orders > 0).sort((a, b) => b.orders - a.orders)
  return {
    facts: {
      window: `last ${days} days`,
      by,
      unit,
      completedOrders: profile.completedOrders,
      best: profile.best,
      quietest: profile.quietest,
      top3: ranked.slice(0, 3),
      ...(profile.completedOrders < 20 ? { caveat: 'Few orders: patterns are weak.' } : {}),
    },
    card: {
      type: 'bars',
      title: by === 'hour' ? 'Orders by hour' : 'Orders by day',
      subtitle: `Last ${days} days · ${formatCount(profile.completedOrders)} orders${profile.best ? ` · busiest ${profile.best.label}` : ''}`,
      unit: 'orders',
      bars: (by === 'hour' ? profile.slots.filter((_, hour) => hour >= 6) : profile.slots).map((slot) => ({
        label: by === 'weekday' ? slot.label.slice(0, 3) : slot.label,
        value: slot.orders,
        isHighlight: slot.label === profile.best?.label,
      })),
    },
    chips:
      by === 'hour'
        ? [{ label: 'Best days', prompt: 'Which days of the week are busiest?' }, ...(profile.quietest ? [{ label: `Fill ${profile.quietest.label}`, prompt: `Suggest a promo to bring customers in around ${profile.quietest.label}.` }] : [])]
        : [{ label: 'Best hours', prompt: 'What hours are busiest?' }, ...(profile.quietest ? [{ label: `Boost ${profile.quietest.label}`, prompt: `Suggest a ${profile.quietest.label} promo.` }] : [])],
  }
}

export const getBestTimesTool: AssistantToolDef<Input> = {
  name: 'get_best_times',
  description: 'Busiest/quietest hours or weekdays (completed orders, Manila time).',
  access: { permission: 'analytics' },
  input,
  async run(ctx, { by, days }) {
    const now = Date.now()
    const startMs = manilaDayStart(now) - (days - 1) * DAY_MS
    const read = await ctx.memo(`sales:${days}`, () =>
      readTenantSales(ctx.tenantId, { readStart: startMs, currentStart: startMs, now, outletId: null, includeItems: false, includePriorVisits: false }),
    )
    if (read.failed) return { facts: { available: false, reason: read.notes[0] ?? 'Sales could not be read.' } }
    return buildBestTimesResult(buildTimeProfile(read.sales, { by, startMs, endMs: now + 1 }), days, by)
  },
}
