'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  listMerchantMcpKeys,
  createMerchantMcpKey,
  revokeMerchantMcpKey,
  type McpKeySummary,
  type CreatedMcpKey,
} from '@/lib/mcp-keys-service'
import { hasPermission, type PermissionHolder } from '@/lib/staff-permissions'

/**
 * Tenant admin server actions for the "Connect AI" page.
 *
 * The tenant is derived from the caller's own `app_users` row on EVERY action —
 * no client argument can name a tenant, so these can only ever mint, list or
 * revoke credentials for the caller's own store (the same injection-not-
 * validation rule the merchant MCP surface itself uses). A minted key carries
 * full merchant authority, so the page is additionally gated on the
 * `store_setup` staff permission and the tenant's `mcp_enabled` flag.
 */

const labelSchema = z.string().trim().min(1, 'Label is required').max(120, 'Label is too long')
const idSchema = z.string().uuid('Invalid key id')

interface MerchantCaller {
  userId: string
  tenantId: string
  tenantSlug: string
}

/** Verifies session + admin role + store_setup permission + mcp_enabled flag. */
async function verifyMerchantAdmin(): Promise<MerchantCaller> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized: Not authenticated')
  }

  const { data: roleRow } = await supabase
    .from('app_users')
    .select('role, tenant_id, is_owner, permissions')
    .eq('user_id', user.id)
    .maybeSingle()

  const appUser = roleRow as
    | (PermissionHolder & { tenant_id: string | null })
    | null
  if (!appUser || appUser.role !== 'admin' || !appUser.tenant_id) {
    throw new Error('Forbidden: Tenant admin access required')
  }
  if (!hasPermission(appUser, 'store_setup')) {
    throw new Error('Forbidden: Store setup permission required to manage AI keys')
  }

  const admin = createAdminClient()
  const { data: tenantRow, error: tenantError } = await admin
    .from('tenants')
    .select('slug, mcp_enabled')
    .eq('id', appUser.tenant_id)
    .single()

  const tenant = tenantRow as { slug: string; mcp_enabled: boolean | null } | null
  if (tenantError || !tenant) {
    throw new Error('Tenant could not be loaded')
  }
  if (tenant.mcp_enabled !== true) {
    throw new Error('The AI connection feature is not enabled for this store')
  }

  return { userId: user.id, tenantId: appUser.tenant_id, tenantSlug: tenant.slug }
}

export async function listMerchantMcpKeysAction(): Promise<McpKeySummary[]> {
  const caller = await verifyMerchantAdmin()
  return listMerchantMcpKeys(createAdminClient(), caller.tenantId)
}

export async function createMerchantMcpKeyAction(label: string): Promise<CreatedMcpKey> {
  const caller = await verifyMerchantAdmin()
  const parsedLabel = labelSchema.parse(label)
  const created = await createMerchantMcpKey(createAdminClient(), caller.tenantId, parsedLabel, caller.userId)
  revalidatePath(`/${caller.tenantSlug}/admin/mcp`)
  return created
}

export async function revokeMerchantMcpKeyAction(id: string): Promise<McpKeySummary> {
  const caller = await verifyMerchantAdmin()
  const parsedId = idSchema.parse(id)
  const summary = await revokeMerchantMcpKey(createAdminClient(), caller.tenantId, parsedId)
  revalidatePath(`/${caller.tenantSlug}/admin/mcp`)
  return summary
}
