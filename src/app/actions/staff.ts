'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantSecrets, upsertTenantSecrets } from '@/lib/tenant-secrets'
import { parseLalamoveSettings } from '@/lib/lalamove-settings'
import { invalidateTenantCache } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { verifyStaffManager, verifyTenantOwner } from '@/lib/admin-service'
import {
  createStaff,
  removeStaff,
  resetStaffPassword,
  updateStaffBranch,
  updateStaffDefaultScreen,
  updateStaffPermissions,
  type StaffBranchContext,
  type StaffRecord,
  type StaffStore,
} from '@/lib/staff-service'
import { canManageBranchStaff } from '@/lib/outlets/branch-scope'

// ============================================
// Staff Management Actions (owner-only)
// ============================================
// All actions verify the caller is the tenant owner before touching the
// service-role client. The admin client never leaves this module.

function makeSupabaseStaffStore(): StaffStore {
  const admin = createAdminClient()

  return {
    listStaff: async (tenantId) => {
      const { data, error } = await admin
        .from('app_users')
        .select(
          'user_id, tenant_id, role, is_owner, outlet_id, permissions, display_name, email, default_tab, created_at'
        )
        .eq('tenant_id', tenantId)
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as StaffRecord[]
    },
    createAuthUser: async ({ email, password }) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error || !data.user) {
        throw new Error(error?.message ?? 'Failed to create the staff account')
      }
      return { userId: data.user.id }
    },
    insertStaffRow: async (row) => {
      const { error } = await admin.from('app_users').insert({
        user_id: row.user_id,
        role: row.role,
        tenant_id: row.tenant_id,
        is_owner: row.is_owner,
        outlet_id: row.outlet_id ?? null,
        permissions: row.permissions,
        display_name: row.display_name,
        email: row.email,
        default_tab: row.default_tab ?? null,
      } as unknown as never)
      if (error) {
        // Don't leave an orphaned auth user behind if the row insert fails.
        await admin.auth.admin.deleteUser(row.user_id).catch(() => undefined)
        throw new Error(error.message)
      }
    },
    updateStaffRow: async (userId, patch) => {
      const { error } = await admin
        .from('app_users')
        .update(patch as unknown as never)
        .eq('user_id', userId)
      if (error) throw new Error(error.message)
    },
    deleteAuthUser: async (userId) => {
      // FK on app_users.user_id cascades, removing the staff row too.
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw new Error(error.message)
    },
    updateAuthPassword: async (userId, password) => {
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) throw new Error(error.message)
    },
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * Establish that the caller manages staff, and gather what the service layer
 * needs to check each individual branch: the store's own branches, and the
 * caller's own scope.
 */
async function staffManagerContext(tenantId: string): Promise<StaffBranchContext> {
  const { userRole } = await verifyStaffManager(tenantId)

  const admin = createAdminClient()

  // Both reads in one round trip: the branches an account may be assigned to,
  // and the seat allowance this tenant's plan includes. The allowance has to
  // come from here rather than a constant — it is the enforcement, and the
  // seat labels in the UI are only a report of it.
  const [{ data, error }, { data: tenant }] = await Promise.all([
    admin.from('outlets').select('id').eq('tenant_id', tenantId),
    admin.from('tenants').select('max_staff_per_branch').eq('id', tenantId).maybeSingle(),
  ])
  if (error) throw new Error(error.message)

  return {
    outlets: (data ?? []) as { id: string }[],
    actor: userRole,
    // Absent falls back to the platform default inside `resolveStaffLimit`,
    // never to unlimited: a failed read must not become a way to mint seats.
    maxStaffPerBranch: (tenant as { max_staff_per_branch?: number | null } | null)
      ?.max_staff_per_branch ?? undefined,
  }
}

export async function listStaffAction(tenantId: string) {
  try {
    const { user, userRole } = await verifyStaffManager(tenantId)
    const staff = await makeSupabaseStaffStore().listStaff(tenantId)
    // A branch admin sees only its own branch's people — the list is also the
    // menu of accounts it can act on. Its own row stays visible either way.
    const visible = staff.filter(
      (s) => canManageBranchStaff(userRole, s.outlet_id ?? null) || s.user_id === user.id
    )
    return { success: true as const, data: visible }
  } catch (error) {
    return { success: false as const, error: errorMessage(error, 'Failed to load staff') }
  }
}

export async function createStaffAction(
  tenantId: string,
  tenantSlug: string,
  input: {
    email: string
    password: string
    displayName: string
    permissions: string[]
    outletId?: string | null
    defaultTab?: string | null
  }
) {
  try {
    const context = await staffManagerContext(tenantId)
    const created = await createStaff(makeSupabaseStaffStore(), tenantId, input, context)
    revalidatePath(`/${tenantSlug}/admin/settings`)
    return { success: true as const, data: created }
  } catch (error) {
    return { success: false as const, error: errorMessage(error, 'Failed to create staff') }
  }
}

export async function updateStaffBranchAction(
  tenantId: string,
  tenantSlug: string,
  userId: string,
  outletId: string | null
) {
  try {
    const context = await staffManagerContext(tenantId)
    await updateStaffBranch(makeSupabaseStaffStore(), tenantId, userId, outletId, context)
    revalidatePath(`/${tenantSlug}/admin/settings`)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: errorMessage(error, 'Failed to update branch') }
  }
}

export async function updateStaffPermissionsAction(
  tenantId: string,
  tenantSlug: string,
  userId: string,
  permissions: string[]
) {
  try {
    const context = await staffManagerContext(tenantId)
    await updateStaffPermissions(
      makeSupabaseStaffStore(),
      tenantId,
      userId,
      permissions,
      context
    )
    revalidatePath(`/${tenantSlug}/admin/settings`)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: errorMessage(error, 'Failed to update permissions') }
  }
}

export async function updateStaffDefaultScreenAction(
  tenantId: string,
  tenantSlug: string,
  userId: string,
  defaultTab: string | null
) {
  try {
    const context = await staffManagerContext(tenantId)
    await updateStaffDefaultScreen(makeSupabaseStaffStore(), tenantId, userId, defaultTab, context)
    revalidatePath(`/${tenantSlug}/admin/settings`)
    return { success: true as const }
  } catch (error) {
    return {
      success: false as const,
      error: errorMessage(error, 'Failed to update the default screen'),
    }
  }
}

export async function resetStaffPasswordAction(
  tenantId: string,
  userId: string,
  newPassword: string
) {
  try {
    const context = await staffManagerContext(tenantId)
    await resetStaffPassword(makeSupabaseStaffStore(), tenantId, userId, newPassword, context)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: errorMessage(error, 'Failed to reset password') }
  }
}

export async function removeStaffAction(tenantId: string, tenantSlug: string, userId: string) {
  try {
    const context = await staffManagerContext(tenantId)
    await removeStaff(makeSupabaseStaffStore(), tenantId, userId, context)
    revalidatePath(`/${tenantSlug}/admin/settings`)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: errorMessage(error, 'Failed to remove staff') }
  }
}

// ============================================
// Own-Account Actions (any admin)
// ============================================

export async function updateOwnCredentialsAction(input: {
  email?: string
  password?: string
}) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Not authenticated')
    }

    const payload: { email?: string; password?: string } = {}
    if (input.email && input.email.trim() && input.email.trim() !== user.email) {
      payload.email = input.email.trim().toLowerCase()
    }
    if (input.password) {
      if (input.password.length < 8) {
        throw new Error('Password must be at least 8 characters')
      }
      payload.password = input.password
    }
    if (!payload.email && !payload.password) {
      throw new Error('Nothing to update')
    }

    const { error } = await supabase.auth.updateUser(payload)
    if (error) throw new Error(error.message)

    // Keep the denormalized email on app_users in sync for staff lists.
    if (payload.email) {
      const admin = createAdminClient()
      await admin
        .from('app_users')
        .update({ email: payload.email } as unknown as never)
        .eq('user_id', user.id)
    }

    return { success: true as const, emailChangeRequested: Boolean(payload.email) }
  } catch (error) {
    return { success: false as const, error: errorMessage(error, 'Failed to update account') }
  }
}

// ============================================
// Lalamove delivery settings (owner-only)
// ============================================

/**
 * A store owner manages its own Lalamove connection: the account keys and the
 * number the rider calls at pickup. The pickup ADDRESS is the store location
 * saved by the delivery settings card, which the same store admin already
 * owns, so it is deliberately not duplicated here.
 *
 * Keys are write-only. Blank key fields mean "keep the stored ones" — a
 * merchant saving a corrected phone number must not wipe its credentials.
 */
export async function updateLalamoveSettingsAction(
  tenantId: string,
  tenantSlug: string,
  input: { apiKey: string; secretKey: string; senderPhone: string }
) {
  try {
    await verifyTenantOwner(tenantId)

    const admin = createAdminClient()
    const { data: tenantRow, error: tenantError } = await admin
      .from('tenants')
      .select('lalamove_market')
      .eq('id', tenantId)
      .single()
    if (tenantError) {
      throw new Error(tenantError.message)
    }

    const secrets = await getTenantSecrets(admin, tenantId)
    const hasExistingKeys = Boolean(secrets?.lalamove_api_key && secrets?.lalamove_secret_key)

    const parsed = parseLalamoveSettings(input, {
      market: (tenantRow as { lalamove_market: string | null } | null)?.lalamove_market ?? null,
      hasExistingKeys,
    })
    if (!parsed.ok) {
      return { success: false as const, error: parsed.error }
    }

    if (parsed.patch.secrets) {
      await upsertTenantSecrets(admin, tenantId, parsed.patch.secrets)
    }

    const { error: updateError } = await admin
      .from('tenants')
      .update(parsed.patch.tenant as unknown as never)
      .eq('id', tenantId)
    if (updateError) {
      throw new Error(updateError.message)
    }

    // A Convex-backed store books through its own deployment, which reads the
    // keys and the pickup contact from `tenantConfig` — saving them here only
    // reaches Supabase.
    const { syncTenantConvexConfig, convexConfigSyncWarning } = await import(
      '@/lib/convex-config-sync'
    )
    const warning = convexConfigSyncWarning(await syncTenantConvexConfig(tenantId))

    // The storefront quotes against the Redis-cached tenant row, so a saved
    // pickup phone stays invisible for 30 minutes unless that copy is dropped.
    await invalidateTenantCache(tenantSlug, tenantId)
    revalidatePath(`/${tenantSlug}/admin/settings`)
    return { success: true as const, warning }
  } catch (error) {
    return { success: false as const, error: errorMessage(error, 'Failed to save Lalamove settings') }
  }
}
