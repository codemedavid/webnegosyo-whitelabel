/**
 * Server-side service layer for per-tenant inventory ingredients
 * (`inventory_items`): raw materials and composite/prep items.
 *
 * Mirrors `units-service.ts`: the pure `ingredientInputSchema` holds all
 * validation; DB wrappers authorize via `verifyTenantPermission` unless a
 * `ProvisioningCtx` (MCP/service-role) is supplied.
 */

import { cache } from 'react'
import type { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantAdmin, verifyTenantPermission } from '@/lib/admin-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { InventoryItem } from '@/types/database'
import { stockUnitChangeProblem } from '@/lib/inventory/recipe-line-rules'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import { ingredientInputSchema, type IngredientInput } from '@/lib/inventory/schemas'
import { parseIngredientDeleteImpact, type IngredientDeleteImpact } from '@/lib/inventory/ingredient-delete'
import {
  grantsForIngredientWrite,
  ingredientWriteRefusal,
  type StoredIngredient,
} from '@/lib/inventory/ingredient-write-grants'

export { ingredientInputSchema, type IngredientInput }

export const getIngredients = cache(async (tenantId: string): Promise<InventoryItem[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as InventoryItem[]
})

export async function createIngredient(
  tenantId: string,
  input: IngredientInput,
  ctx?: ProvisioningCtx,
): Promise<InventoryItem> {
  const caller = ctx ? null : await verifyTenantPermission(tenantId, 'menu', 'create')
  const validated = ingredientInputSchema.parse(input)
  if (caller) {
    // The master is `menu`; a starting price is also `costs` (Phase 0d).
    const refusal = ingredientWriteRefusal(caller.userRole, grantsForIngredientWrite(null, validated))
    if (refusal) throw new Error(refusal)
  }
  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({ tenant_id: tenantId, ...validated } as never)
    .select()
    .single()

  if (error) throw error
  return data as unknown as InventoryItem
}

/**
 * An update as a form sends it. The price and reorder level may be left out —
 * a screen that hides prices from this account does — and then stay as stored.
 */
export type IngredientUpdateInput = z.input<typeof ingredientInputSchema>

/** Fields whose schema default would OVERWRITE a stored value if applied on update. */
const KEEP_WHEN_ABSENT = ['unit_cost', 'reorder_level'] as const

function withoutDefaultedFields(validated: IngredientInput, input: IngredientUpdateInput): Partial<IngredientInput> {
  return Object.fromEntries(
    Object.entries(validated).filter(
      ([key]) => !(KEEP_WHEN_ABSENT as readonly string[]).includes(key) || input[key as keyof IngredientUpdateInput] !== undefined,
    ),
  ) as Partial<IngredientInput>
}

export async function updateIngredient(
  ingredientId: string,
  tenantId: string,
  input: IngredientUpdateInput,
): Promise<InventoryItem> {
  const { userRole } = await verifyTenantAdmin(tenantId)
  const validated = withoutDefaultedFields(ingredientInputSchema.parse(input), input)
  const supabase = await createClient()

  // Each CHANGED field asks for its own grant: the master is `menu`, the price
  // `costs`, the reorder level `inventory` (Phase 0d). The form resubmits every
  // field, so the stored row decides what actually changed.
  const stored = await readStoredIngredient(supabase, ingredientId, tenantId)
  const refusal = ingredientWriteRefusal(userRole, grantsForIngredientWrite(stored, validated))
  if (refusal) throw new Error(refusal)

  await assertStockUnitChangeKeepsRecipes(supabase, tenantId, ingredientId, stored, validated)

  const { data, error } = await supabase
    .from('inventory_items')
    .update({ ...validated, updated_at: new Date().toISOString() } as never)
    .eq('id', ingredientId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as InventoryItem
}

/**
 * A stock unit that no longer converts from the units recipes measure this
 * ingredient in would make every sale skip it (recipe_components_unit_guard
 * only fires when a LINE is written). Refused at the moment of the change.
 */
async function assertStockUnitChangeKeepsRecipes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  ingredientId: string,
  stored: { name?: string | null; stock_unit_id?: string | null } | null,
  validated: Partial<IngredientInput>,
): Promise<void> {
  const newUnitId = validated.stock_unit_id
  if (!newUnitId || newUnitId === stored?.stock_unit_id) return

  const [lines, units] = await Promise.all([
    supabase.from('recipe_components').select('unit_id').eq('tenant_id', tenantId).eq('inventory_item_id', ingredientId),
    supabase.from('inventory_units').select('id, name, abbreviation, dimension, to_base_factor').eq('tenant_id', tenantId),
  ])
  if (lines.error) throw lines.error
  if (units.error) throw units.error

  const problem = stockUnitChangeProblem(
    validated.name ?? stored?.name ?? '',
    newUnitId,
    (lines.data ?? []).map((line) => line.unit_id as string),
    (units.data ?? []) as unknown as InventoryUnit[],
  )
  if (problem) throw new Error(problem)
}

const STORED_COLUMNS = 'name, sku, category, stock_unit_id, unit_cost, is_prep, image_url, reorder_level, is_active'

async function readStoredIngredient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ingredientId: string,
  tenantId: string,
): Promise<StoredIngredient> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(STORED_COLUMNS)
    .eq('id', ingredientId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('This ingredient no longer exists. Refresh the page to see the current list.')
  return data as unknown as StoredIngredient
}

/**
 * Never a bare DELETE: `recipe_components` is ON DELETE RESTRICT (every
 * ingredient in a recipe was refused) and the stock ledger is ON DELETE
 * CASCADE (every other one lost its history). `delete_inventory_item` removes
 * the recipe lines and archives instead of deleting when there is history.
 */
async function runIngredientDelete(
  ingredientId: string,
  tenantId: string,
  isDryRun: boolean,
): Promise<IngredientDeleteImpact> {
  await verifyTenantPermission(tenantId, 'menu', 'delete')
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('delete_inventory_item', {
    p_tenant_id: tenantId,
    p_item_id: ingredientId,
    p_dry_run: isDryRun,
  })

  if (error) {
    if (error.code === 'P0002') {
      throw new Error('This ingredient no longer exists. Refresh the page to see the current list.')
    }
    throw error
  }
  return parseIngredientDeleteImpact(data)
}

/** What a delete WOULD do, without changing anything. */
export function previewIngredientDelete(ingredientId: string, tenantId: string) {
  return runIngredientDelete(ingredientId, tenantId, true)
}

export function deleteIngredient(ingredientId: string, tenantId: string) {
  return runIngredientDelete(ingredientId, tenantId, false)
}
