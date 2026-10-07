/**
 * Who is calling, read ONCE per request.
 *
 * Every admin render used to authenticate over and over: the admin layout read
 * the user and their `app_users` row, then each `verifyTenantPermission` a page
 * reached during the same render (orders, queue, analytics…) did its own
 * GoTrue `getUser()` round trip, its own `app_users` read and its own
 * subscription read — all sequential, all identical. On a page that loads three
 * services that is ~9 network hops before the first row of real data.
 *
 * React `cache()` memoises per request inside Server Components (the layout and
 * the page share one render), and is a plain pass-through anywhere React has no
 * request scope (route handlers, tests), so behaviour outside a render is
 * unchanged. Nothing here weakens a check: it is the same `getUser()` — still
 * verified against GoTrue, not just a decoded cookie — asked once instead of N
 * times.
 */

import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { fetchSubscription } from '@/lib/billing/subscription-repository'
import {
  asAppUserQueryClient,
  fetchAppUserScope,
  type AppUserScopeRow,
} from '@/lib/queries/fetch-app-user-scope'

export interface RequestCaller {
  /** Null when there is no session, or GoTrue refused it. */
  user: User | null
  /** The `app_users` row; null for a signed-in visitor with no admin record. */
  appUser: AppUserScopeRow | null
  /** Non-null only when the `app_users` read itself failed. */
  roleError: string | null
}

const ANONYMOUS: RequestCaller = { user: null, appUser: null, roleError: null }

export const getRequestCaller = cache(async (): Promise<RequestCaller> => {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return ANONYMOUS

  const { appUser, error } = await fetchAppUserScope(asAppUserQueryClient(supabase), user.id)
  return { user, appUser, roleError: error }
})

/**
 * The tenant's subscription row, once per request. Fails open (null) exactly as
 * `fetchSubscription` does — null reads as "not blocked".
 */
export const getRequestSubscription = cache(async (tenantId: string) => {
  const supabase = await createClient()
  return fetchSubscription(supabase, tenantId)
})
