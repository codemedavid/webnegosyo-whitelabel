/**
 * search_menu — find dishes by name so the model has refs to talk about (and,
 * later, to propose changes against). Case- and accent-insensitive.
 */

import { z } from 'zod'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { readAssistantMenu, type AssistantMenuItem } from '@/lib/assistant/data/menu'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const RESULT_LIMIT = 10

const input = z.object({ query: z.string().trim().min(1).max(60).describe('Dish or category name; "*" lists all') })
type Input = z.infer<typeof input>

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function searchMenu(menu: readonly AssistantMenuItem[], query: string): AssistantMenuItem[] {
  if (query.trim() === '*') return [...menu]
  const terms = fold(query).split(/\s+/).filter(Boolean)
  return menu.filter((item) => {
    const haystack = fold(`${item.name} ${item.categoryName ?? ''}`)
    return terms.every((term) => haystack.includes(term))
  })
}

export function buildSearchMenuResult(matches: readonly AssistantMenuItem[], refs: RefBook): ToolResult {
  const shown = matches.slice(0, RESULT_LIMIT)
  return {
    facts: {
      matched: matches.length,
      items: shown.map((item) => ({
        ref: refs.refFor('item', item.id),
        name: item.name,
        price: item.price,
        category: item.categoryName,
        ...(item.isAvailable ? {} : { outOfStock: true }),
      })),
    },
    card: {
      type: 'ranked',
      title: 'Menu',
      subtitle: matches.length > shown.length ? `${shown.length} of ${matches.length} matches` : `${matches.length} found`,
      rows: shown.map((item) => ({
        label: item.name,
        value: formatPeso(item.price),
        detail: item.categoryName ?? undefined,
        ...(item.isAvailable ? {} : { badge: 'Out of stock' }),
      })),
      emptyText: 'No dish matches that name.',
    },
  }
}

export const searchMenuTool: AssistantToolDef<Input> = {
  name: 'search_menu',
  description: 'Find dishes by name/category; returns refs, price, availability.',
  access: { permission: 'menu' },
  input,
  async run(ctx, { query }) {
    const menu = await ctx.memo('menu', () => readAssistantMenu(ctx.tenantId))
    return buildSearchMenuResult(searchMenu(menu, query), ctx.refs)
  },
}
