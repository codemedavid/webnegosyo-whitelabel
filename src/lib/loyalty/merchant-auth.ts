/**
 * Who may touch loyalty, shared by every merchant-side loyalty route.
 *
 * Authenticated with the CALLER's own access token, and the tenant is the
 * caller's tenant, never the body's claim alone. On top of that, every call
 * needs the `loyalty_manage` grant: a program's rules and a customer's balance
 * both move value, and the `customers` grant that shows the guest list must not
 * be enough to rewrite everyone's stamp card.
 *
 * Extracted from `/api/loyalty/programs` so the members route cannot drift
 * into a weaker check than the one guarding the programs beside it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export interface LoyaltyCaller {
  userId: string
  tenantId: string
}

export async function authorizeLoyaltyMerchant(
  request: NextRequest,
  tenantId: string
): Promise<LoyaltyCaller | NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: appUser } = await supabase
    .from('app_users')
    .select('role, tenant_id, permissions, is_owner')
    .eq('user_id', user.id)
    .single()

  const isTenantMember =
    appUser?.role === 'superadmin' || (appUser?.role === 'admin' && appUser.tenant_id === tenantId)
  if (!isTenantMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { hasPermission } = await import('@/lib/staff-permissions')
  const permitted = hasPermission(
    {
      role: appUser?.role ?? null,
      is_owner: appUser?.is_owner ?? false,
      permissions: (appUser?.permissions as string[] | null) ?? null,
    },
    'loyalty_manage'
  )
  if (!permitted) {
    return NextResponse.json({ error: 'Forbidden: loyalty_manage is required.' }, { status: 403 })
  }

  return { userId: user.id, tenantId }
}

/** A tenant id off a query string or body, trimmed to nothing when absent. */
export function readTenantId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
