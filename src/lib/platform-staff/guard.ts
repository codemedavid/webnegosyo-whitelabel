import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  asAppUserQueryClient,
  fetchAppUserScope,
  type AppUserScopeRow,
} from '@/lib/queries/fetch-app-user-scope'
import {
  hasPlatformPermission,
  isConsoleUser,
  type PlatformPermission,
} from '@/lib/platform-staff/permissions'

/**
 * Server-side console checks. Every superadmin-console server action and route
 * handler calls one of these with the exact grant its operation needs — the
 * middleware gates pages, but a POST aimed straight at a server action never
 * passes through a page.
 */

export interface ConsoleCaller {
  user: { id: string; email?: string | null }
  appUser: AppUserScopeRow
}

/** The signed-in superadmin or platform staff account, or null. */
export async function getConsoleCaller(): Promise<ConsoleCaller | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { appUser } = await fetchAppUserScope(asAppUserQueryClient(supabase), user.id)
  if (!appUser || !isConsoleUser(appUser)) return null

  return { user: { id: user.id, email: user.email ?? null }, appUser }
}

export class PlatformAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlatformAccessError'
  }
}

/** Throws unless the caller holds `permission` (superadmins always do). */
export async function requirePlatformPermission(
  permission: PlatformPermission
): Promise<ConsoleCaller> {
  const caller = await getConsoleCaller()
  if (!caller) throw new PlatformAccessError('Unauthorized: Not authenticated')
  if (!hasPlatformPermission(caller.appUser, permission)) {
    throw new PlatformAccessError('Forbidden: You do not have access to do this')
  }
  return caller
}

/** Throws unless the caller is a full superadmin — for grants no one may hold. */
export async function requireFullSuperadmin(): Promise<ConsoleCaller> {
  const caller = await getConsoleCaller()
  if (!caller) throw new PlatformAccessError('Unauthorized: Not authenticated')
  if (caller.appUser.role !== 'superadmin') {
    throw new PlatformAccessError('Forbidden: Superadmin access required')
  }
  return caller
}

/** Per-user data: never let a shared cache keep it. */
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const

/** Route-handler form: a ready 401/403 response, or null to proceed. */
export async function platformPermissionResponse(
  permission: PlatformPermission
): Promise<NextResponse | null> {
  const caller = await getConsoleCaller()
  if (caller && hasPlatformPermission(caller.appUser, permission)) return null
  return NextResponse.json(
    { success: false, data: null, error: caller ? 'You do not have access to do this' : 'Not authenticated' },
    { status: caller ? 403 : 401, headers: NO_STORE_HEADERS },
  )
}
