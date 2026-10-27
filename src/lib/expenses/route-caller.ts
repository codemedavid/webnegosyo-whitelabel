/**
 * Who is calling an expenses API route: the web admin (cookie session) or the
 * merchant app (`Authorization: Bearer`). Call it INSIDE `withRequestBearer`,
 * which makes `createClient()` act as the token's user for the request — so
 * both paths get the same GoTrue-verified user, the same `app_users` row, and
 * a client whose reads RLS decides.
 */

import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getRequestCaller } from '@/lib/auth/request-caller'
import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'
import { canAccessStoreAdmin, type PlatformAction } from '@/lib/platform-staff/permissions'
import { hasPermission } from '@/lib/staff-permissions'
import { createClient } from '@/lib/supabase/server'

export interface ExpenseRouteCaller {
  /** Acts AS the caller: RLS applies to everything it reads. */
  db: SupabaseClient
  user: User
  appUser: AppUserScopeRow | null
}

export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS })
}

/** The signed-in caller, or null (→ 401). */
export async function resolveExpenseRouteCaller(): Promise<ExpenseRouteCaller | null> {
  const { user, appUser } = await getRequestCaller()
  if (!user) return null
  const db = (await createClient()) as unknown as SupabaseClient
  return { db, user, appUser }
}

/** A member of `tenantId`'s store (own admins/staff, superadmins, granted platform staff). */
export function isStoreMember(caller: ExpenseRouteCaller, tenantId: string, action: PlatformAction): boolean {
  return canAccessStoreAdmin(caller.appUser, tenantId, action)
}

/** Holds the `expenses` key (owners, superadmins and legacy full-access accounts included). */
export function holdsExpenses(caller: ExpenseRouteCaller): boolean {
  return caller.appUser !== null && hasPermission(caller.appUser, 'expenses')
}
