/**
 * get_item_pairs — what customers order together (last 90 days), optionally
 * around one dish. Lift > 1 means more often than chance.
 */

import { z } from 'zod'
import { getBasketSummary, type BasketSummary } from '@/lib/boost/order-baskets'
import { readAssistantMenu, type AssistantMenuItem } from '@/lib/assistant/data/menu'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const PAIR_LIMIT = 8

const input = z.object({ item: z.string().nullable().describe('Item ref (e.g. i3) to focus on, or null for all') })
type Input = z.infer<typeof input>

export function buildItemPairsResult(
  summary: BasketSummary,
  menu: readonly AssistantMenuItem[],
  focusId: string | null,
  refs: RefBook,
): ToolResult {
  if (!summary.isAvailable) return { facts: { available: false, reason: summary.note ?? 'Order history could not be read.' } }
  const nameOf = new Map(menu.map((item) => [item.id, item.name]))
  const pairs = summary.pairs
    .filter((pair) => !focusId || pair.anchorId === focusId || pair.partnerId === focusId)
    .filter((pair) => nameOf.has(pair.anchorId) && nameOf.has(pair.partnerId))
    .slice(0, PAIR_LIMIT)

  const first = pairs[0]
  return {
    facts: {
      window: summary.windowLabel,
      orders: summary.orderCount,
      pairs: pairs.map((pair) => ({
        a: { ref: refs.refFor('item', pair.anchorId), name: nameOf.get(pair.anchorId) },
        b: { ref: refs.refFor('item', pair.partnerId), name: nameOf.get(pair.partnerId) },
        together: pair.together,
        sharePct: Math.round(pair.share * 100),
        lift: Math.round(pair.lift * 10) / 10,
        strength: pair.strength,
      })),
      ...(pairs.length === 0 ? { note: 'No dishes are ordered together more often than chance yet.' } : {}),
    },
    card: {
      type: 'ranked',
      title: 'Ordered together',
      subtitle: `${summary.windowLabel} · ${summary.orderCount} orders`,
      rows: pairs.map((pair) => ({
        label: `${nameOf.get(pair.anchorId)} + ${nameOf.get(pair.partnerId)}`,
        value: `${Math.round(pair.share * 100)}%`,
        detail: `${pair.together} orders together`,
        badge: pair.strength === 'always' ? 'Strong' : undefined,
      })),
      emptyText: 'No clear pairs yet.',
    },
    chips: first
      ? [{ label: 'Make it a combo', prompt: `Make a combo of ${nameOf.get(first.anchorId)} and ${nameOf.get(first.partnerId)}.` }]
      : [],
    links: [{ label: 'Open Boost Sales', path: '/boost-sales' }],
  }
}

export const getItemPairsTool: AssistantToolDef<Input> = {
  name: 'get_item_pairs',
  description: 'Dishes ordered together (90 days): share of orders, lift. For combos/pairings.',
  access: { permission: 'analytics' },
  input,
  async run(ctx, { item }) {
    const focusId = item ? ctx.refs.resolve(item, 'item') : null
    if (item && !focusId) return { facts: { error: `Unknown item ref ${item}. Use search_menu first.` } }
    const [summary, menu] = await Promise.all([
      getBasketSummary(ctx.tenantId),
      ctx.memo('menu', () => readAssistantMenu(ctx.tenantId)),
    ])
    return buildItemPairsResult(summary, menu, focusId, ctx.refs)
  },
}
