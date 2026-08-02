'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import {
  OWNER_PATCH,
  assertCanAddOwner,
  assertNotLastOwner,
  type OwnershipUser,
} from '@/lib/tenant-ownership'
import { transferOwnership, type OwnershipStore } from '@/lib/tenant-ownership-service'

// Schema for creating new admin user
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenant_id: z.string().uuid(),
  is_owner: z.boolean().default(false),
})

// Schema for handing a store to one of its existing admins
const setOwnerSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
})

// Schema for updating user role/tenant
const updateUserSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['superadmin', 'admin']),
  tenant_id: z.string().uuid().nullable(),
})

export interface TenantUser {
  user_id: string
  email: string
  role: 'superadmin' | 'admin'
  /** Owns the store: full access, manages staff, exempt from the staff seat cap. */
  is_owner: boolean
  tenant_id: string | null
  created_at: string
}

/**
 * The superadmin gate every action in this file sits behind.
 *
 * Returns the caller on success and an error envelope on failure, so each
 * action keeps its existing `{ error }` contract with the client.
 */
async function requireSuperadmin(): Promise<
  { currentUser: { id: string }; error: null } | { currentUser: null; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()
  if (!currentUser) {
    return { currentUser: null, error: 'Unauthorized: Not authenticated' }
  }

  const { data: roleData } = await supabase
    .from('app_users')
    .select('role')
    .eq('user_id', currentUser.id)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!roleData || (roleData as any).role !== 'superadmin') {
    return { currentUser: null, error: 'Unauthorized: Only superadmins can manage tenant users' }
  }

  return { currentUser, error: null }
}

/** Reads and writes `app_users` ownership rows with service-role access. */
function makeOwnershipStore(): OwnershipStore {
  const adminClient = createAdminClient()

  return {
    listTenantUsers: async (tenantId) => {
      const { data, error } = await adminClient
        .from('app_users')
        .select('user_id, role, is_owner, outlet_id')
        .eq('tenant_id', tenantId)

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as OwnershipUser[]
    },
    updateUserRow: async (userId, patch) => {
      const { error } = await adminClient
        .from('app_users')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq('user_id', userId)

      if (error) throw new Error(error.message)
    },
  }
}

/**
 * Get all users for a specific tenant
 */
export async function getTenantUsers(tenantId: string): Promise<TenantUser[]> {
  const auth = await requireSuperadmin()
  if (auth.error) {
    console.error('getTenantUsers:', auth.error)
    return []
  }

  // Use admin client for consistent access
  const adminClient = createAdminClient()

  // Query app_users joined with auth.users to get email
  const { data, error } = await adminClient
    .from('app_users')
    .select(`
      user_id,
      role,
      is_owner,
      tenant_id,
      created_at
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching tenant users:', error)
    return []
  }

  // Get user emails from auth.users using admin client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = data?.map((u: any) => u.user_id) || []
  if (userIds.length === 0) {
    return []
  }

  // Fetch only the specific users we need (not ALL auth users)
  const emailMap = new Map<string, string>()
  for (const userId of userIds) {
    const { data: authUser } = await adminClient.auth.admin.getUserById(userId)
    if (authUser?.user) {
      emailMap.set(userId, authUser.user.email || '')
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (data || []).map((user: any) => ({
    user_id: user.user_id,
    email: emailMap.get(user.user_id) || 'Unknown',
    role: user.role as 'superadmin' | 'admin',
    is_owner: user.is_owner === true,
    tenant_id: user.tenant_id,
    created_at: user.created_at,
  }))

  return result
}

/**
 * Create a new admin user for a tenant
 */
export async function createTenantUser(input: {
  email: string
  password: string
  tenant_id: string
  is_owner?: boolean
}) {
  try {
    // Validate input
    const parsed = createUserSchema.parse(input)

    const auth = await requireSuperadmin()
    if (!auth.currentUser) {
      return { error: auth.error }
    }

    const adminClient = createAdminClient()

    // A store has exactly one owner. Checked before the auth user is created
    // so a rejected second owner cannot leave an orphan login behind.
    if (parsed.is_owner) {
      const existing = await makeOwnershipStore().listTenantUsers(parsed.tenant_id)
      assertCanAddOwner(existing)
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
    })

    if (authError) {
      return { error: authError.message }
    }

    if (!authData.user) {
      return { error: 'Failed to create user' }
    }

    // Create app_users entry using admin client
    const { error: appUserError } = await adminClient
      .from('app_users')
      .insert({
        user_id: authData.user.id,
        role: 'admin',
        tenant_id: parsed.tenant_id,
        // Denormalized so staff lists render without reading auth.users.
        email: parsed.email,
        ...(parsed.is_owner ? OWNER_PATCH : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

    if (appUserError) {
      // Cleanup: delete auth user if app_users insert fails
      let cleanupError: string | null = null
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(authData.user.id)
      if (deleteError) {
        cleanupError = deleteError.message || String(deleteError)
        console.error('Failed to cleanup auth user after app_users insert failure:', deleteError)
      }
      const errorMessage = cleanupError
        ? `${appUserError.message} (cleanup also failed: ${cleanupError})`
        : appUserError.message
      return { error: errorMessage }
    }

    // Revalidate pages
    revalidatePath(`/superadmin/tenants/${parsed.tenant_id}`)
    revalidatePath('/superadmin/tenants')

    return {
      success: true,
      user: {
        user_id: authData.user.id,
        email: authData.user.email || '',
        is_owner: parsed.is_owner,
      }
    }
  } catch (err) {
    console.error('createTenantUser error:', err)
    if (err instanceof z.ZodError) {
      return { error: err.issues.map((e: z.ZodIssue) => e.message).join(', ') }
    }
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' }
  }
}

/**
 * Remove a user from a tenant (delete from app_users)
 */
export async function removeTenantUser(userId: string, tenantId: string) {
  try {
    const supabase = await createClient()

    const auth = await requireSuperadmin()
    if (!auth.currentUser) {
      return { error: auth.error }
    }

    // Don't allow removing self
    if (auth.currentUser.id === userId) {
      return { error: 'Cannot remove yourself' }
    }

    // Removing the owner of a store that still has admins would leave nobody
    // able to manage staff, and no in-product way to fix it.
    assertNotLastOwner(await makeOwnershipStore().listTenantUsers(tenantId), userId)

    // Delete from app_users
    const { data: deletedRows, error } = await supabase
      .from('app_users')
      .delete()
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .select()

    if (error) {
      return { error: error.message }
    }

    if (!deletedRows || deletedRows.length === 0) {
      return { error: 'User not found for this tenant' }
    }

    // Also delete the auth user using admin client
    const adminClient = createAdminClient()
    await adminClient.auth.admin.deleteUser(userId)

    // Revalidate pages
    revalidatePath(`/superadmin/tenants/${tenantId}`)
    revalidatePath('/superadmin/tenants')

    return { success: true }
  } catch (err) {
    console.error('removeTenantUser error:', err)
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' }
  }
}

/**
 * Update user role or tenant assignment
 */
export async function updateTenantUser(input: {
  user_id: string
  role: 'superadmin' | 'admin'
  tenant_id: string | null
}) {
  try {
    const supabase = await createClient()

    // Validate input
    const parsed = updateUserSchema.parse(input)

    const auth = await requireSuperadmin()
    if (!auth.currentUser) {
      return { error: auth.error }
    }

    // Don't allow modifying self
    if (auth.currentUser.id === parsed.user_id) {
      return { error: 'Cannot modify your own role' }
    }

    // Update app_users entry
    const { data, error } = await supabase
      .from('app_users')
      .update({
        role: parsed.role,
        tenant_id: parsed.tenant_id,
      })
      .eq('user_id', parsed.user_id)
      .select()

    if (error) {
      return { error: error.message }
    }

    if (!data || data.length === 0) {
      return { error: 'User not found' }
    }

    // Revalidate pages
    if (parsed.tenant_id) {
      revalidatePath(`/superadmin/tenants/${parsed.tenant_id}`)
    }
    revalidatePath('/superadmin/tenants')

    return { success: true }
  } catch (err) {
    console.error('updateTenantUser error:', err)
    if (err instanceof z.ZodError) {
      return { error: err.issues.map((e: z.ZodIssue) => e.message).join(', ') }
    }
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' }
  }
}

/**
 * Hand a store to one of its existing admin accounts.
 *
 * A store has exactly one owner, so this is a transfer rather than a grant:
 * the sitting owner is stood down in the same operation. See
 * `tenant-ownership-service.ts` for the ordering and rollback rules.
 */
export async function setTenantOwner(input: { tenant_id: string; user_id: string }) {
  try {
    const parsed = setOwnerSchema.parse(input)

    const auth = await requireSuperadmin()
    if (!auth.currentUser) {
      return { error: auth.error }
    }

    await transferOwnership(makeOwnershipStore(), parsed.tenant_id, parsed.user_id)

    revalidatePath(`/superadmin/tenants/${parsed.tenant_id}`)
    revalidatePath('/superadmin/tenants')

    return { success: true }
  } catch (err) {
    console.error('setTenantOwner error:', err)
    if (err instanceof z.ZodError) {
      return { error: err.issues.map((e: z.ZodIssue) => e.message).join(', ') }
    }
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' }
  }
}

