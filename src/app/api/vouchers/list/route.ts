import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { findActiveVouchers } from '@/lib/vouchers/repository'

/**
 * POST /api/vouchers/list
 *
 * Every voucher the merchant currently has switched on, so the register's
 * discount sheet can offer them for a cashier to tap. Until this existed the
 * counter had only a text box, which assumes the cashier knows what the shop is
 * running — and the promotions are written by the owner in the web admin.
 *
 * The tenant check below is a harder boundary than the lookup route's. That one
 * leaks a single voucher to a caller who already knew its code; this one would
 * hand over a merchant's entire live pricing strategy, and the service-role
 * client it reads with bypasses RLS by design.
 *
 * Deliberately NOT gated on the `vouchers` staff permission, for the same
 * reason /api/vouchers/lookup is not: that permission governs a MANUAL
 * discount, where a cashier invents money off at will. Reading the codes the
 * merchant is advertising is ordinary counter work.
 */

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId = body?.tenantId

  if (typeof tenantId !== 'string' || tenantId.trim() === '') {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .single()

  const isAuthorized =
    appUser?.role === 'superadmin' ||
    (appUser?.role === 'admin' && appUser.tenant_id === tenantId)

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // The authorized tenant and the queried tenant are the same value, so what
  // was authorized above is exactly what is read.
  const vouchers = await findActiveVouchers(createAdminClient(), tenantId)

  return NextResponse.json({ vouchers })
}
