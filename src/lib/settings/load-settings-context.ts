import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getCachedCurrentUserRole, getCachedTenantBySlug } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { decideOwnerAccess } from '@/lib/order-deletion/access'
import { canManageStaff, hasPermission } from '@/lib/staff-permissions'
import { canManageBranchStaff, canViewBranchDirectory } from '@/lib/outlets/branch-scope'
import {
  buildSettingsCatalog,
  canOpenSettingsSection,
  type SettingsGroup,
  type SettingsSectionKey,
  type SettingsViewer,
} from '@/lib/settings/settings-catalog'
import type { Tenant } from '@/types/database'

type Caller = NonNullable<Awaited<ReturnType<typeof getCachedCurrentUserRole>>>

export interface SettingsContext {
  tenant: Tenant
  tenantSlug: string
  caller: Caller | { role: string; tenant_id: null; is_owner?: null; outlet_id?: null; permissions?: null }
  viewer: SettingsViewer
  catalog: SettingsGroup[]
  accountEmail: string | null
}

/**
 * Everything a settings page needs to know about the store and the viewer.
 * Cached per request, so the layout (rail) and the page share one read.
 */
export const loadSettingsContext = cache(async (tenantSlug: string): Promise<SettingsContext | null> => {
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) return null

  const userRole = await getCachedCurrentUserRole()
  // An unreadable role keeps today's behaviour: treated as a full-access admin
  // here, with every write still checked server-side by its own action.
  const caller = userRole ?? { role: 'admin', tenant_id: null }

  const viewer: SettingsViewer = {
    isOwner: canManageStaff(caller),
    // Deleting orders is the store owner's alone — not staff, not a superadmin.
    isStoreOwner: decideOwnerAccess(
      { role: caller.role, tenant_id: caller.tenant_id, is_owner: caller.is_owner ?? null },
      tenant.id
    ).allowed,
    // A branch admin manages its own branch's people, so it gets the team section too.
    canManageAnyStaff: canManageStaff(caller) || canManageBranchStaff(caller, caller.outlet_id ?? null),
    isBranchScopedAccount: !canViewBranchDirectory(caller),
    hasPermission: (key) => hasPermission(caller, key),
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return {
    tenant,
    tenantSlug,
    caller,
    viewer,
    catalog: buildSettingsCatalog({ viewer, tenant, tenantSlug }),
    accountEmail: user?.email ?? null,
  }
})

/**
 * The gate every section page runs first: the store must exist and the viewer
 * must be offered the section, otherwise back to the overview.
 */
export async function requireSettingsSection(
  tenantSlug: string,
  section: SettingsSectionKey
): Promise<SettingsContext> {
  const context = await loadSettingsContext(tenantSlug)
  if (!context || !canOpenSettingsSection(section, context)) {
    redirect(`/${tenantSlug}/admin/settings`)
  }
  return context
}
