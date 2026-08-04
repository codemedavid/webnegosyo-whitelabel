import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createVoucherLookup } from '@/lib/vouchers/repository'
import { normalizeVoucherCodes } from '@/lib/vouchers/resolve'

/**
 * POST /api/vouchers/lookup
 *
 * Resolves voucher codes into the `Voucher` objects the register prices with.
 *
 * The register evaluates vouchers locally, using a byte-identical copy of the
 * shared engine, so a code is worth the same at the counter as it is online.
 * But the vouchers themselves are rows in the platform database, not on the
 * phone — this is how a code a customer presents becomes something the
 * register can evaluate.
 *
 * Deliberately NOT gated on the `vouchers` staff permission. That permission
 * governs a MANUAL discount, where a cashier invents money off at will and the
 * only defence is knowing who did it. Honouring a code the merchant created
 * and is advertising is ordinary counter work; requiring a supervisor for it
 * would mean fetching one every time a customer produced a coupon.
 *
 * Authenticated via the caller's own Supabase access token — the same trust
 * level as /api/inventory/order-stock.
 */

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId = body?.tenantId

  if (typeof tenantId !== 'string' || tenantId.trim() === '') {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  }

  // Normalised through the same function `resolveVouchers` uses, not a copy of
  // it. `findByCodes` matches `code` exactly while the unique index is on
  // `lower(code)` — codes are case-insensitive by design. Passing the cashier's
  // keystrokes through raw told them a code was not recognised while the web
  // checkout, which normalises first, honoured the very same code.
  const codes = normalizeVoucherCodes(Array.isArray(body?.codes) ? (body.codes as unknown[]) : [])

  if (codes.length === 0) {
    return NextResponse.json(
      { error: 'codes must be a non-empty array of strings' },
      { status: 400 },
    )
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

  // The lookup runs under the service-role client, which bypasses RLS by
  // design — `findByCodes` therefore filters on tenant_id inside the query
  // rather than afterwards. The authorization above and that filter use the
  // same `tenantId` value, so what was authorized is what is read.
  const lookup = createVoucherLookup(createAdminClient())
  const vouchers = await lookup.findByCodes(tenantId, codes)

  return NextResponse.json({ vouchers })
}
