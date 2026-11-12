/**
 * propose_ingredient — add an ingredient to the stock list, optionally with
 * an opening count, for the owner to confirm. The ingredient master is
 * `menu`; the opening count is filed as a `stocktake` movement after the
 * ingredient exists (the ledger is the only writer of stock) and needs
 * `inventory` too. No price: what things cost is `costs`, set on a delivery.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getIngredients } from '@/lib/inventory/ingredients-service'
import { hasPermission } from '@/lib/staff-permissions'
import { foldName } from '@/lib/assistant/insights/menu-import'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { IngredientPayload } from '@/lib/assistant/actions/kinds'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'

const input = z.object({
  name: z.string().trim().min(2).max(80),
  unit: z.string().trim().min(1).max(30).describe("Stock unit from the store's units, e.g. kg, g, L, pcs"),
  reorderLevel: z.number().min(0).max(1_000_000).nullable().describe('Warn when stock drops to this; null = 0'),
  openingCount: z.number().min(0).max(1_000_000).nullable().describe('How much is on hand now; null = start at 0'),
  category: z.string().trim().max(60).nullable(),
})
type Input = z.infer<typeof input>

interface UnitRow { id: string; name: string; abbreviation: string; is_active: boolean | null }

export function pickUnit(units: readonly UnitRow[], wanted: string): UnitRow | null {
  const folded = foldName(wanted)
  const active = units.filter((unit) => unit.is_active !== false)
  return (
    active.find((unit) => foldName(unit.abbreviation) === folded) ??
    active.find((unit) => foldName(unit.name) === folded) ??
    // "kilos", "pieces": a plural of the unit's own name.
    active.find((unit) => folded.endsWith('s') && foldName(unit.name) === folded.slice(0, -1)) ??
    null
  )
}

export const proposeIngredientTool: AssistantToolDef<Input> = {
  name: 'propose_ingredient',
  description: 'Propose adding a new ingredient to inventory (name, stock unit, reorder level, opening count). The user must confirm.',
  access: { permission: 'menu' },
  isAvailable: (flags) => flags.inventoryEnabled,
  input,
  async run(ctx, request) {
    const existing = (await ctx.memo('ingredients', () => getIngredients(ctx.tenantId))).find((item) => foldName(item.name) === foldName(request.name))
    if (existing) return refused(`"${existing.name}" is already an ingredient. Use propose_stock_adjustment to record stock for it.`)

    const { data } = await (await createClient())
      .from('inventory_units')
      .select('id, name, abbreviation, is_active')
      .eq('tenant_id', ctx.tenantId)
      .limit(200)
    const units = (data ?? []) as UnitRow[]
    const unit = pickUnit(units, request.unit)
    if (!unit) {
      const offered = units.filter((row) => row.is_active !== false).map((row) => row.abbreviation)
      return refused(`"${request.unit}" is not one of this store's units. Units: ${offered.join(', ') || 'none — add one in Inventory → Units first'}.`)
    }

    const openingCount = request.openingCount !== null && request.openingCount > 0 ? request.openingCount : null
    const canCount = hasPermission(ctx.caller, 'inventory')
    const payload: IngredientPayload = {
      name: request.name,
      stockUnitId: unit.id,
      unitLabel: unit.abbreviation,
      reorderLevel: request.reorderLevel ?? 0,
      openingCount: canCount ? openingCount : null,
      category: request.category?.trim() || null,
    }
    return fileProposal(ctx, {
      kind: 'ingredient',
      payload,
      summary: `Add ingredient ${request.name}`,
      title: `Add ${request.name} to your ingredients`,
      lines: [
        { label: 'Stock unit', value: unit.name === unit.abbreviation ? unit.name : `${unit.name} (${unit.abbreviation})` },
        { label: 'Warn when at', value: `${payload.reorderLevel} ${unit.abbreviation}` },
        { label: 'On hand now', value: payload.openingCount === null ? `0 ${unit.abbreviation}` : `${payload.openingCount} ${unit.abbreviation} (recorded as a count)` },
        ...(payload.category ? [{ label: 'Category', value: payload.category }] : []),
      ],
      warning:
        openingCount !== null && !canCount
          ? 'Your account can add ingredients but not count stock, so it starts at 0.'
          : 'Its price is set when you record a delivery with a cost.',
    })
  },
}
