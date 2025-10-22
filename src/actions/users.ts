'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

// Schema for creating new admin user
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenant_id: z.string().uuid(),
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
  tenant_id: string | null
  created_at: string
}

/**
 * Get all users for a specific tenant
 */
export async function getTenantUsers(tenantId: string): Promise<TenantUser[]> {
  // Use admin client for consistent access
  const adminClient = createAdminClient()

  // Query app_users joined with auth.users to get email
  const { data, error } = await adminClient
    .from('app_users')
    .select(`
      user_id,
      role,
      tenant_id,
      created_at
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  console.log('getTenantUsers - tenantId:', tenantId)
  console.log('getTenantUsers - data:', data)
  console.log('getTenantUsers - error:', error)

  if (error) {
    console.error('Error fetching tenant users:', error)
    return []
  }

  // Get user emails from auth.users using admin client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = data?.map((u: any) => u.user_id) || []
  if (userIds.length === 0) {
    console.log('No users found for tenant:', tenantId)
    return []
  }

  const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers()
  
  console.log('Auth users count:', authUsers?.users.length)
  console.log('Auth error:', authError)

  if (authError || !authUsers) {
    console.error('Error fetching auth users:', authError)
    return []
  }

  const emailMap = new Map(
    authUsers.users.map(u => [u.id, u.email || ''])
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (data || []).map((user: any) => ({
    user_id: user.user_id,
    email: emailMap.get(user.user_id) || 'Unknown',
    role: user.role as 'superadmin' | 'admin',
    tenant_id: user.tenant_id,
    created_at: user.created_at,
  }))

  console.log('Returning users:', result)
  return result
}

/**
 * Create a new admin user for a tenant
 */
export async function createTenantUser(input: {
  email: string
  password: string
  tenant_id: string
}) {
  const supabase = await createClient()

  // Validate input
  const parsed = createUserSchema.parse(input)

  // Verify current user is superadmin
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (!currentUser) {
    return { error: 'Unauthorized: Not authenticated' }
  }

  const { data: roleData } = await supabase
    .from('app_users')
    .select('role')
    .eq('user_id', currentUser.id)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!roleData || (roleData as any).role !== 'superadmin') {
    return { error: 'Unauthorized: Only superadmins can create users' }
  }

  // Create auth user using admin client
  const adminClient = createAdminClient()
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

  if (appUserError) {
    // Cleanup: delete auth user if app_users insert fails
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return { error: appUserError.message }
  }

  // Revalidate pages
  revalidatePath(`/superadmin/tenants/${parsed.tenant_id}`)
  revalidatePath('/superadmin/tenants')

  return { 
    success: true, 
    user: {
      user_id: authData.user.id,
      email: authData.user.email || '',
    }
  }
}

/**
 * Remove a user from a tenant (delete from app_users)
 */
export async function removeTenantUser(userId: string, tenantId: string) {
  const supabase = await createClient()

  // Verify current user is superadmin
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (!currentUser) {
    return { error: 'Unauthorized: Not authenticated' }
  }

  const { data: roleData } = await supabase
    .from('app_users')
    .select('role')
    .eq('user_id', currentUser.id)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!roleData || (roleData as any).role !== 'superadmin') {
    return { error: 'Unauthorized: Only superadmins can remove users' }
  }

  // Don't allow removing self
  if (currentUser.id === userId) {
    return { error: 'Cannot remove yourself' }
  }

  // Delete from app_users (this will also delete auth user due to cascade)
  const { error } = await supabase
    .from('app_users')
    .delete()
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)

  if (error) {
    return { error: error.message }
  }

  // Also delete the auth user using admin client
  const adminClient = createAdminClient()
  await adminClient.auth.admin.deleteUser(userId)

  // Revalidate pages
  revalidatePath(`/superadmin/tenants/${tenantId}`)
  revalidatePath('/superadmin/tenants')

  return { success: true }
}

/**
 * Update user role or tenant assignment
 */
export async function updateTenantUser(input: {
  user_id: string
  role: 'superadmin' | 'admin'
  tenant_id: string | null
}) {
  const supabase = await createClient()

  // Validate input
  const parsed = updateUserSchema.parse(input)

  // Verify current user is superadmin
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (!currentUser) {
    return { error: 'Unauthorized: Not authenticated' }
  }

  const { data: roleData } = await supabase
    .from('app_users')
    .select('role')
    .eq('user_id', currentUser.id)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!roleData || (roleData as any).role !== 'superadmin') {
    return { error: 'Unauthorized: Only superadmins can update users' }
  }

  // Don't allow modifying self
  if (currentUser.id === parsed.user_id) {
    return { error: 'Cannot modify your own role' }
  }

  // Update app_users entry
  const { error } = await supabase
    .from('app_users')
    // @ts-expect-error - Supabase type mismatch for app_users table
    .update({
      role: parsed.role,
      tenant_id: parsed.tenant_id,
    })
    .eq('user_id', parsed.user_id)

  if (error) {
    return { error: error.message }
  }

  // Revalidate pages
  if (parsed.tenant_id) {
    revalidatePath(`/superadmin/tenants/${parsed.tenant_id}`)
  }
  revalidatePath('/superadmin/tenants')

  return { success: true }
}

