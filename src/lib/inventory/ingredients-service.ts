/**
 * Server-side service layer for per-tenant inventory ingredients
 * (`inventory_items`): raw materials and composite/prep items.
 *
 * Mirrors `units-service.ts`: the pure `ingredientInputSchema` holds all
 * validation; DB wrappers authorize via `verifyTenantPermission` unless a
 * `ProvisioningCtx` (MCP/service-role) is supplied.
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { InventoryItem } from '@/types/database'
import { ingredientInputSchema, type IngredientInput } from '@/lib/inventory/schemas'
import { parseIngredientDeleteImpact, type IngredientDeleteImpact } from '@/lib/inventory/ingredient-delete'

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
  if (!ctx) await verifyTenantPermission(tenantId, 'menu', 'create')
  const validated = ingredientInputSchema.parse(input)
  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({ tenant_id: tenantId, ...validated } as never)
    .select()
    .single()

  if (error) throw error
  return data as unknown as InventoryItem
}

export async function updateIngredient(
  ingredientId: string,
  tenantId: string,
  input: IngredientInput,
): Promise<InventoryItem> {
  await verifyTenantPermission(tenantId, 'menu')
  const validated = ingredientInputSchema.parse(input)
  const supabase = await createClient()

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
