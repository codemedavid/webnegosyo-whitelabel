/**
 * Server-side service layer for the reusable modifier-group library.
 *
 * A library entry is a per-tenant modifier-group definition. Attaching one
 * copies a fresh-id snapshot into `menu_items.modifier_groups`
 * (snapshot-on-attach) so the storefront/cart/order runtime stays unchanged.
 *
 * The pure helpers (schema, snapshot, prefill, attach/dedupe) hold all the real
 * logic and are unit-tested in modifier-library-utils. The DB wrappers mirror
 * addon-library-service.ts.
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { ModifierGroupLibraryEntry } from '@/types/database'
import {
  modifierGroupLibraryEntrySchema,
  type ModifierGroupLibraryInput,
} from '@/lib/modifier-library-utils'

// Re-export the client-safe pure helpers + schema so existing importers (and
// tests) can keep importing from this module.
export {
  modifierGroupLibraryEntrySchema,
  libraryEntryToModifierGroup,
  buildLibraryDraftFromGroup,
  attachEntriesToGroups,
  type ModifierGroupLibraryInput,
} from '@/lib/modifier-library-utils'

// ============================================
// DB access (tenant-scoped, mirrors addon-library-service.ts)
// ============================================

export const getModifierGroupLibrary = cache(
  async (tenantId: string): Promise<ModifierGroupLibraryEntry[]> => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('modifier_group_library')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as unknown as ModifierGroupLibraryEntry[]
  },
)

export async function createModifierGroupLibraryEntry(
  tenantId: string,
  input: ModifierGroupLibraryInput,
  ctx?: ProvisioningCtx,
): Promise<ModifierGroupLibraryEntry> {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')
  const validated = modifierGroupLibraryEntrySchema.parse(input)
  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('modifier_group_library')
    .insert({ tenant_id: tenantId, ...validated } as never)
    .select()
    .single()

  if (error) throw error
  return data as unknown as ModifierGroupLibraryEntry
}

export async function updateModifierGroupLibraryEntry(
  entryId: string,
  tenantId: string,
  input: ModifierGroupLibraryInput,
): Promise<ModifierGroupLibraryEntry> {
  await verifyTenantPermission(tenantId, 'menu')
  const validated = modifierGroupLibraryEntrySchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('modifier_group_library')
    .update({ ...validated, updated_at: new Date().toISOString() } as never)
    .eq('id', entryId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as ModifierGroupLibraryEntry
}

export async function deleteModifierGroupLibraryEntry(
  entryId: string,
  tenantId: string,
): Promise<void> {
  await verifyTenantPermission(tenantId, 'menu')
  const supabase = await createClient()

  const { error } = await supabase
    .from('modifier_group_library')
    .delete()
    .eq('id', entryId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}
