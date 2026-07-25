/**
 * Server-side service layer for per-tenant inventory ingredients
 * (`inventory_items`): raw materials and composite/prep items.
 *
 * Mirrors `units-service.ts`: the pure `ingredientInputSchema` holds all
 * validation; DB wrappers authorize via `verifyTenantPermission` unless a
 * `ProvisioningCtx` (MCP/service-role) is supplied.
 */

import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { InventoryItem } from '@/types/database'

export const ingredientInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  sku: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  stock_unit_id: z.string().uuid('A stock unit is required'),
  unit_cost: z.number().min(0, 'Unit cost cannot be negative').default(0),
  is_prep: z.boolean().default(false),
  image_url: z.string().url().optional().nullable(),
  reorder_level: z.number().min(0).default(0),
  is_active: z.boolean().default(true),
})

export type IngredientInput = z.infer<typeof ingredientInputSchema>

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
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')
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

export async function deleteIngredient(ingredientId: string, tenantId: string): Promise<void> {
  await verifyTenantPermission(tenantId, 'menu')
  const supabase = await createClient()

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', ingredientId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}
