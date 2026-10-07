/**
 * propose_stock_adjustment — record a delivery, waste, or a stock count, for
 * the owner to confirm. Quantities are in the ingredient's own stock unit.
 */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import type { StockPayload } from '@/lib/assistant/actions/kinds'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'

const ACTIONS = { receive: 'receive', waste: 'waste', count: 'stocktake' } as const
const ACTION_LABEL = { receive: 'Received', waste: 'Wasted', count: 'Counted on hand' } as const

const input = z.object({
  ingredient: z.string().trim().min(1).describe('Ingredient ref (g1) or exact name'),
  action: z.enum(['receive', 'waste', 'count']),
  quantity: z.number().min(0).max(1_000_000).describe("In the ingredient's stock unit"),
  note: z.string().trim().max(120).nullable(),
})
type Input = z.infer<typeof input>

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function projectedQuantity(current: number, action: Input['action'], quantity: number): number {
  if (action === 'receive') return round2(current + quantity)
  if (action === 'waste') return round2(Math.max(0, current - quantity))
  return round2(quantity)
}

export const proposeStockAdjustmentTool: AssistantToolDef<Input> = {
  name: 'propose_stock_adjustment',
  description: 'Propose recording a delivery (receive), waste, or a stock count for one ingredient. The user must confirm.',
  access: { permission: 'menu' },
  isAvailable: (flags) => flags.inventoryEnabled,
  input,
  async run(ctx, request) {
    if (request.action !== 'count' && request.quantity <= 0) return refused('Quantity must be more than zero.')
    const admin = createAdminClient()
    const byRef = ctx.refs.resolve(request.ingredient, 'ingredient')
    const query = admin.from('inventory_items').select('id, name, current_qty, stock_unit_id, is_active').eq('tenant_id', ctx.tenantId)
    const { data: rows } = byRef ? await query.eq('id', byRef).limit(1) : await query.ilike('name', request.ingredient.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(2)
    const item = rows?.length === 1 ? rows[0] : null
    if (!item || item.is_active === false) return refused(`No single active ingredient matches "${request.ingredient}".`)

    const { data: unit } = await admin.from('inventory_units').select('abbreviation').eq('id', item.stock_unit_id).maybeSingle()
    const unitLabel = unit?.abbreviation ? ` ${unit.abbreviation}` : ''
    const current = Number(item.current_qty) || 0
    const after = projectedQuantity(current, request.action, request.quantity)

    const payload: StockPayload = {
      ingredientName: item.name,
      input: {
        inventory_item_id: item.id,
        reason: ACTIONS[request.action],
        quantity: request.quantity,
        unit_id: item.stock_unit_id,
        note: request.note ?? 'Recorded via the Owl assistant',
      },
    }
    return fileProposal(ctx, {
      kind: 'stock_adjustment',
      payload,
      summary: `${ACTION_LABEL[request.action]} ${request.quantity}${unitLabel} of ${item.name}`,
      title: `Stock: ${item.name}`,
      lines: [
        { label: ACTION_LABEL[request.action], value: `${request.quantity}${unitLabel}` },
        { label: 'On hand', value: `${round2(current)}${unitLabel} → ${after}${unitLabel}` },
      ],
    })
  },
}
