/**
 * The prologue every Senior/PWD route shares: a member of the store (the
 * Bearer token, `requireBearerStoreCaller`) who ALSO holds the feature the
 * route needs, and — for a route that names a branch — a branch they may act
 * for. See `caller-scope.ts` for the rules themselves.
 */

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { requireBearerStoreCaller, type BearerCaller, type BearerRefusal } from '@/lib/auth/bearer-caller'
import type { PlatformAction } from '@/lib/platform-staff/permissions'
import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'
import type { StaffPermissionKey } from '@/lib/staff-permissions'
import { callerHasFeature, resolveCallerOutlet, type CallerOutlet } from './caller-scope'

export type GovCaller = BearerCaller & { appUser: AppUserScopeRow }

const FORBIDDEN = 'You do not have permission for this.'

function forbidden(): BearerRefusal {
  return { ok: false, response: NextResponse.json({ error: FORBIDDEN }, { status: 403 }) }
}

/** A member of the store holding `feature`, or the refusal to send back. */
export async function requireGovCaller(
  request: Request,
  tenantId: string,
  action: PlatformAction,
  feature: StaffPermissionKey,
): Promise<GovCaller | BearerRefusal> {
  const caller = await requireBearerStoreCaller(request, tenantId, action)
  if (!caller.ok) return caller
  if (!caller.appUser || !callerHasFeature(caller.appUser, feature)) return forbidden()
  return { ...caller, appUser: caller.appUser }
}

/** The branch the caller acts for, checked against the store's own branches. */
export async function resolveRouteOutlet(
  db: SupabaseClient<Database>,
  appUser: AppUserScopeRow,
  tenantId: string,
  requested: string | null,
): Promise<CallerOutlet> {
  // A branch-locked account never needs the list; skip the read.
  const quick = resolveCallerOutlet(appUser, requested, new Set(requested === null ? [] : [requested]))
  if (!quick.ok || requested === null || quick.outletId !== requested) return quick
  const { data, error } = await db
    .from('outlets')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', requested)
    .maybeSingle()
  if (error) throw new Error(`[gov-discounts] branch lookup: ${error.message}`)
  return resolveCallerOutlet(appUser, requested, new Set(data ? [data.id] : []))
}

/** The JSON refusal for an outlet the caller may not act for. */
export function outletRefusal(outlet: Extract<CallerOutlet, { ok: false }>): NextResponse {
  const error = outlet.status === 403 ? 'You can only act for your own branch.' : 'That branch is not part of this store.'
  return NextResponse.json({ error }, { status: outlet.status })
}
