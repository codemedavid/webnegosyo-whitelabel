/**
 * Server-side service layer for per-tenant inventory units of measure.
 *
 * The pure `unitInputSchema` holds all validation logic and is unit-tested.
 * The DB wrappers mirror `addon-library-service.ts`: cookie-based auth via
 * `verifyTenantPermission` unless a `ProvisioningCtx` (MCP/service-role) is
 * supplied, in which case authorization has already happened upstream.
 *
 * `seedDefaultUnits` populates a tenant's catalog from the pure
 * `DEFAULT_UNITS` list on first use so recipes have units to reference.
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { InventoryUnitRow } from '@/types/database'
import { buildDefaultUnitInserts } from '@/lib/inventory/default-units'
import { unitInputSchema, type UnitInput } from '@/lib/inventory/schemas'

export { unitInputSchema, type UnitInput }

// ============================================
// DB access (tenant-scoped, mirrors addon-library-service.ts)
// ============================================

export const getUnits = cache(async (tenantId: string): Promise<InventoryUnitRow[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('inventory_units')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('dimension', { ascending: true })
    .order('to_base_factor', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as InventoryUnitRow[]
})

/**
 * Seed the tenant's default unit catalog on first use. Idempotent: if the
 * tenant already has any units, the existing rows are returned untouched.
 */
export async function seedDefaultUnits(
  tenantId: string,
  ctx?: ProvisioningCtx,
): Promise<InventoryUnitRow[]> {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')
  const supabase = ctx?.client ?? (await createClient())

  const { data: existing, error: existingError } = await supabase
    .from('inventory_units')
    .select('*')
    .eq('tenant_id', tenantId)

  if (existingError) throw existingError
  if (existing && existing.length > 0) return existing as unknown as InventoryUnitRow[]

  const { data, error } = await supabase
    .from('inventory_units')
    .insert(buildDefaultUnitInserts(tenantId) as never)
    .select()

  if (error) throw error
  return (data ?? []) as unknown as InventoryUnitRow[]
}

export async function createUnit(
  tenantId: string,
  input: UnitInput,
  ctx?: ProvisioningCtx,
): Promise<InventoryUnitRow> {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')
  const validated = unitInputSchema.parse(input)
  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('inventory_units')
    .insert({ tenant_id: tenantId, ...validated } as never)
    .select()
    .single()

  if (error) throw error
  return data as unknown as InventoryUnitRow
}

export async function updateUnit(
  unitId: string,
  tenantId: string,
  input: UnitInput,
): Promise<InventoryUnitRow> {
  await verifyTenantPermission(tenantId, 'menu')
  const validated = unitInputSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('inventory_units')
    .update({ ...validated, updated_at: new Date().toISOString() } as never)
    .eq('id', unitId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as InventoryUnitRow
}

export async function deleteUnit(unitId: string, tenantId: string): Promise<void> {
  await verifyTenantPermission(tenantId, 'menu')
  const supabase = await createClient()

  const { error } = await supabase
    .from('inventory_units')
    .delete()
    .eq('id', unitId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}
