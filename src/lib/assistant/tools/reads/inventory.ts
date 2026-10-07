/**
 * get_inventory — what is out or low, what the stock is worth, and recent
 * stock movements (received, wasted, counted, sold).
 */

import { z } from 'zod'
import { getIngredients } from '@/lib/inventory/ingredients-service'
import { getInventoryActivity } from '@/lib/inventory/activity-feed-read'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { summarizeStock, type StockStatus } from '@/lib/assistant/insights/inventory-status'
import type { ActivityFeedEntry } from '@/lib/inventory/activity-feed'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const LIST_LIMIT = 8

const input = z.object({ view: z.enum(['attention', 'movements']).describe('attention = out/low stock + value; movements = recent stock changes') })
type Input = z.infer<typeof input>

function qty(value: number, unit: string): string {
  return `${value}${unit ? ` ${unit}` : ''}`
}

export function buildStockResult(status: StockStatus, refs: RefBook): ToolResult {
  const shown = status.attention.slice(0, LIST_LIMIT)
  return {
    facts: {
      ingredients: status.activeCount,
      out: status.outCount,
      low: status.lowCount,
      stockValue: status.stockValue,
      needsAttention: shown.map((row) => ({ ref: refs.refFor('ingredient', row.id), name: row.name, level: row.level, onHand: qty(row.quantity, row.unit), reorderAt: qty(row.reorderLevel, row.unit) })),
    },
    card: {
      type: 'ranked',
      title: 'Stock to watch',
      subtitle: `${status.outCount} out · ${status.lowCount} low · stock worth ${formatPeso(status.stockValue)}`,
      rows: shown.map((row) => ({
        label: row.name,
        value: qty(row.quantity, row.unit),
        detail: `Reorder at ${qty(row.reorderLevel, row.unit)}`,
        badge: row.level === 'out' ? 'Out' : 'Low',
      })),
      emptyText: 'Everything is above its reorder level.',
    },
    chips: [{ label: 'Recent movements', prompt: 'Show my recent stock movements.' }],
    links: [{ label: 'Open Inventory', path: '/inventory' }],
  }
}

export function buildMovementsResult(entries: readonly ActivityFeedEntry[], loadFailed: boolean): ToolResult {
  if (loadFailed) return { facts: { available: false, reason: 'Stock movements could not be read.' } }
  const shown = entries.slice(0, LIST_LIMIT)
  return {
    facts: {
      movements: shown.map((entry) => ({
        what: entry.title,
        lines: entry.lines.slice(0, 4),
        when: entry.createdAt.slice(0, 16),
        by: entry.isAutomatic ? 'automatic (orders)' : (entry.actorName ?? 'unknown'),
      })),
    },
    card: {
      type: 'ranked',
      title: 'Recent stock movements',
      rows: shown.map((entry) => ({
        label: entry.title,
        value: entry.direction === 'in' ? 'In' : entry.direction === 'out' ? 'Out' : 'Mixed',
        detail: [entry.lines.slice(0, 2).join(', '), entry.isAutomatic ? 'automatic' : entry.actorName].filter(Boolean).join(' · '),
      })),
      emptyText: 'No stock movements yet.',
    },
    links: [{ label: 'Open Inventory', path: '/inventory' }],
  }
}

async function readUnits(tenantId: string): Promise<Map<string, string>> {
  const { data } = await createAdminClient().from('inventory_units').select('id, abbreviation').eq('tenant_id', tenantId)
  return new Map((data ?? []).map((row) => [row.id, row.abbreviation]))
}

export const getInventoryTool: AssistantToolDef<Input> = {
  name: 'get_inventory',
  description: 'Inventory: out/low ingredients and stock value, or recent stock movements.',
  access: { permission: 'menu' },
  isAvailable: (flags) => flags.inventoryEnabled,
  input,
  async run(ctx, { view }) {
    const ingredients = await getIngredients(ctx.tenantId)
    if (view === 'movements') {
      const { entries, loadFailed } = await getInventoryActivity(ctx.tenantId, ingredients)
      return buildMovementsResult(entries, loadFailed)
    }
    return buildStockResult(summarizeStock(ingredients, await readUnits(ctx.tenantId)), ctx.refs)
  },
}
