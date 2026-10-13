/**
 * Who is calling an approvals route. Bearer token (the merchant app) or a
 * cookie session wrapped by withRequestBearer; either way the user is
 * verified by GoTrue and their app_users row is read server-side. The store
 * must be the caller's OWN store (or the caller a superadmin): a client's
 * tenantId is checked, never trusted. Platform staff are not store accounts
 * and cannot ask for or answer money decisions.
 */
import { NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import type { ApprovalActor } from './types'

/** Per person, per minute, across every approvals route. */
export const APPROVALS_BURST_LIMIT = { limit: 30, windowSec: 60 } as const

export type ApprovalsCallerResult =
  | { ok: true; actor: ApprovalActor; tenantId: string }
  | { ok: false; response: NextResponse }

function refuse(status: number, error: string): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json({ success: false, data: null, error }, { status, headers: { 'Cache-Control': 'private, no-store' } }),
  }
}

export async function resolveApprovalsCaller(request: Request, tenantId: string): Promise<ApprovalsCallerResult> {
  const caller = await requireBearerStoreCaller(request, tenantId, 'edit')
  if (!caller.ok) {
    return refuse(caller.response.status, caller.response.status === 401 ? 'Sign in again.' : 'This is not your store.')
  }
  const appUser = caller.appUser
  const isStoreAccount =
    appUser?.role === 'superadmin' || (appUser?.role === 'admin' && appUser.tenant_id === tenantId)
  if (!appUser || !isStoreAccount) return refuse(403, 'This is not your store.')

  const burst = await checkRateLimit(`approvals:${caller.user.id}`, { ...APPROVALS_BURST_LIMIT, onRedisFailure: 'instance' })
  if (!burst.allowed) return refuse(429, 'One moment — try again shortly.')

  return {
    ok: true,
    tenantId,
    actor: {
      userId: caller.user.id,
      role: appUser.role,
      isOwner: appUser.is_owner === true,
      permissions: appUser.permissions ?? null,
      outletId: appUser.outlet_id ?? null,
    },
  }
}
