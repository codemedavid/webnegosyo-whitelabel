/**
 * Who is calling an API route with a Bearer token — the merchant app's way in.
 *
 * The app sends the staff member's own Supabase access token. Every
 * app-facing route used to repeat the same prologue by hand: read the header,
 * build a client around it, `getUser()` (verified by GoTrue, not just a
 * decoded JWT), read the `app_users` row, then check the caller may act on the
 * named store. Sixteen copies, none with a bounded fetch — so a stalled
 * GoTrue/PostgREST held every one of those requests open until the platform
 * killed it. This is that prologue, once.
 *
 * Feature permissions (`menu`, `pos`, `customers`…) differ per route and stay
 * in the route: this answers "is this a member of the store", not "may they
 * use this feature".
 */

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'
import { canAccessStoreAdmin, type PlatformAction } from '@/lib/platform-staff/permissions'
import {
  asAppUserQueryClient,
  fetchAppUserScope,
  type AppUserScopeRow,
} from '@/lib/queries/fetch-app-user-scope'

/** Same budget as the cookie server client: a request-path query that gives up. */
export const BEARER_QUERY_TIMEOUT_MS = 10_000

export interface BearerCaller {
  ok: true
  /** A client that acts AS the caller — RLS applies to everything it reads. */
  supabase: SupabaseClient
  user: User
  appUser: AppUserScopeRow | null
}

export interface BearerRefusal {
  ok: false
  /** 401 or 403 with the `{ error }` body the merchant app already parses. */
  response: NextResponse
}

export type BearerCallerResult = BearerCaller | BearerRefusal

function refuse(status: 401 | 403): BearerRefusal {
  const error = status === 401 ? 'Unauthorized' : 'Forbidden'
  return { ok: false, response: NextResponse.json({ error }, { status }) }
}

/** A Supabase client carrying the request's Authorization header, or null when it has none. */
export function createBearerClient(request: Request): SupabaseClient | null {
  const authorization = request.headers.get('authorization')
  if (!authorization) return null
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: authorization },
        fetch: createTimedFetch(BEARER_QUERY_TIMEOUT_MS),
      },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}

/** The authenticated caller and their `app_users` row; 401 when there is no valid token. */
export async function authenticateBearer(request: Request): Promise<BearerCallerResult> {
  const supabase = createBearerClient(request)
  if (!supabase) return refuse(401)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return refuse(401)

  const { appUser } = await fetchAppUserScope(asAppUserQueryClient(supabase), user.id)
  return { ok: true, supabase, user, appUser }
}

/**
 * The caller, refused unless they may perform `action` on `tenantId`'s store
 * (its own admins/staff, superadmins, or platform staff holding the grant).
 */
export async function requireBearerStoreCaller(
  request: Request,
  tenantId: string,
  action: PlatformAction,
): Promise<BearerCallerResult> {
  const caller = await authenticateBearer(request)
  if (!caller.ok) return caller
  if (!canAccessStoreAdmin(caller.appUser, tenantId, action)) return refuse(403)
  return caller
}
