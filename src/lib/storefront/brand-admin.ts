import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/** Prefix of every cookie `@supabase/ssr` writes. */
const SUPABASE_COOKIE_PREFIX = 'sb-'

interface AppUserRole {
  role: string
  tenant_id: string | null
}

/** The slice of a Supabase client the check needs; injectable for tests. */
export interface BrandAdminClient {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }
  from: (table: 'app_users') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: unknown }> }
    }
  }
}

/** Whether the client's signed-in user administers `tenantId`. */
export async function isBrandAdminFor(client: BrandAdminClient, tenantId: string): Promise<boolean> {
  const { data: { user } } = await client.auth.getUser()
  if (!user) return false

  const { data } = await client.from('app_users').select('role, tenant_id').eq('user_id', user.id).maybeSingle()
  const role = data as AppUserRole | null
  if (!role) return false

  return role.role === 'superadmin' || (role.role === 'admin' && role.tenant_id === tenantId)
}

/**
 * Whether the current request comes from an admin of this tenant.
 *
 * This is the only per-visitor read on a public storefront page, and the one
 * reason those pages render dynamically; everything else is served from the
 * storefront cache. A visitor without a Supabase cookie is anonymous by
 * definition, so the auth server is not consulted at all for the common case.
 * Any failure resolves to "not an admin" — the affordance it unlocks is an
 * edit shortcut, never access.
 */
export async function resolveIsBrandAdmin(tenantId: string): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const hasSession = cookieStore.getAll().some(({ name }) => name.startsWith(SUPABASE_COOKIE_PREFIX))
    if (!hasSession) return false

    const supabase = await createClient()
    return await isBrandAdminFor(supabase as unknown as BrandAdminClient, tenantId)
  } catch {
    return false
  }
}
