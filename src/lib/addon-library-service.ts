/**
 * Server-side service layer for the reusable add-on library.
 *
 * A library entry is a per-tenant add-on definition. Attaching one to a menu
 * item copies a {id, name, price} Addon snapshot into `menu_items.addons`
 * (snapshot-on-attach) so the customer/cart/order runtime stays unchanged.
 *
 * The pure helpers (schema, snapshot, prefill, attach/dedupe) hold all the real
 * logic and are unit-tested. The DB wrappers mirror `admin-service.ts`.
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { AddonLibraryEntry } from '@/types/database'
import { addonLibraryEntrySchema, type AddonLibraryInput } from '@/lib/addon-library-utils'

// Re-export the client-safe pure helpers + schema so existing importers (and
// tests) can keep importing from this module.
export {
  addonLibraryEntrySchema,
  libraryEntryToAddon,
  buildLibraryDraftFromMenuItem,
  attachEntriesToAddons,
  type AddonLibraryInput,
} from '@/lib/addon-library-utils'

// ============================================
// DB access (tenant-scoped, mirrors admin-service.ts)
// ============================================

export const getAddonLibrary = cache(async (tenantId: string): Promise<AddonLibraryEntry[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('addon_library')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as AddonLibraryEntry[]
})

export async function createAddonLibraryEntry(
  tenantId: string,
  input: AddonLibraryInput,
  ctx?: ProvisioningCtx,
): Promise<AddonLibraryEntry> {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')
  const validated = addonLibraryEntrySchema.parse(input)
  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('addon_library')
    .insert({ tenant_id: tenantId, ...validated } as never)
    .select()
    .single()

  if (error) throw error
  return data as unknown as AddonLibraryEntry
}

export async function updateAddonLibraryEntry(
  entryId: string,
  tenantId: string,
  input: AddonLibraryInput,
): Promise<AddonLibraryEntry> {
  await verifyTenantPermission(tenantId, 'menu')
  const validated = addonLibraryEntrySchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('addon_library')
    .update({ ...validated, updated_at: new Date().toISOString() } as never)
    .eq('id', entryId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as AddonLibraryEntry
}

export async function deleteAddonLibraryEntry(entryId: string, tenantId: string): Promise<void> {
  await verifyTenantPermission(tenantId, 'menu')
  const supabase = await createClient()

  const { error } = await supabase
    .from('addon_library')
    .delete()
    .eq('id', entryId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}

/**
 * List a tenant's add-on library for provisioning flows (the MCP), so an entry
 * can be resolved by name before it is attached to menu items. Uses the
 * service-role `ctx` client when provided, mirroring the other provisioning
 * reads in `admin-service.ts`.
 */
export async function listAddonLibraryForProvisioning(
  tenantId: string,
  ctx?: ProvisioningCtx,
): Promise<AddonLibraryEntry[]> {
  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('addon_library')
    .select('id, name, price, display_order')
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as AddonLibraryEntry[]
}
