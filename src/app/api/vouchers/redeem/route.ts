import { NextRequest, NextResponse } from 'next/server'
import { requireBearerStoreCaller } from '@/lib/auth/bearer-caller'
import { createAdminClient } from '@/lib/supabase/admin'
import { redeemVoucher } from '@/lib/vouchers/repository'
import type { VoucherChannel } from '@/lib/vouchers/types'
import { callerHasFeature } from '@/lib/gov-discount-ledger/caller-scope'
import { outletRefusal, resolveRouteOutlet } from '@/lib/gov-discount-ledger/route-guards'

/**
 * POST /api/vouchers/redeem
 *
 * Burns voucher redemptions for a sale the register has already written.
 *
 * The register prices vouchers locally — it has to keep working on a flaky
 * connection at a counter — but it cannot burn a redemption itself.
 * `redeem_voucher()` is SECURITY DEFINER and executable by `service_role`
 * only, deliberately, after a security review found PostgREST had published it
 * to anon and anyone could exhaust a merchant's vouchers. The phone holds an
 * anon key. So the burn happens here, on a server that holds the service key.
 *
 * Without this route a POS voucher's `used_count` never moves and a
 * usage-limited code can be reused at a counter indefinitely.
 *
 * Authenticated via the caller's own Supabase access token — the same trust
 * level as /api/inventory/order-stock, which the register already calls after
 * a tender.
 *
 * This route reports faithfully; the CALLER is best-effort. That split is
 * deliberate: the sale is already rung up and paid for, so the register must
 * not fail a tender over a burn, but it must not be told a burn happened when
 * it did not either. `redeemVoucher` returns `redeemed: false` rather than
 * throwing for exactly this reason, and swallowing that here would tell a
 * merchant their usage limit is being enforced when it is not.
 */

/** One voucher to burn against this order. */
interface RedemptionInput {
  voucherId?: unknown
  amount?: unknown
}

interface NormalisedRedemption {
  voucherId: string
  amount: number
}

const CHANNELS: readonly VoucherChannel[] = ['pos', 'checkout']

/**
 * Validates the redemptions a caller sent.
 *
 * Returns null when any entry is unusable rather than dropping it. Unlike a
 * stock line — where one bad entry must not stop the rest of an order moving —
 * a dropped redemption is a discount given away for free, silently. The whole
 * request is refused so the caller finds out.
 */
function normaliseRedemptions(value: unknown): NormalisedRedemption[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const normalised: NormalisedRedemption[] = []

  for (const entry of value as RedemptionInput[]) {
    const voucherId = entry?.voucherId
    const amount = Number(entry?.amount)

    if (typeof voucherId !== 'string' || voucherId.trim() === '') return null
    if (!Number.isFinite(amount) || amount <= 0) return null

    normalised.push({ voucherId, amount })
  }

  return normalised
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId = body?.tenantId
  const orderId = body?.orderId

  if (typeof tenantId !== 'string' || typeof orderId !== 'string') {
    return NextResponse.json(
      { error: 'tenantId and orderId are required' },
      { status: 400 },
    )
  }

  const redemptions = normaliseRedemptions(body?.redemptions)
  if (!redemptions) {
    return NextResponse.json(
      { error: 'redemptions must be a non-empty array of { voucherId, amount > 0 }' },
      { status: 400 },
    )
  }

  // Absent means the register: the counter is the only caller that cannot burn
  // its own redemptions, which is why this route exists.
  const channel: unknown = body?.channel ?? 'pos'
  if (!CHANNELS.includes(channel as VoucherChannel)) {
    return NextResponse.json(
      { error: `channel must be one of ${CHANNELS.join(', ')}` },
      { status: 400 },
    )
  }

  const caller = await requireBearerStoreCaller(request, tenantId, 'create')
  if (!caller.ok) return caller.response
  const { user, appUser } = caller
  // Only the register burns redemptions (pos-tender); a voucher is money.
  if (!appUser || !callerHasFeature(appUser, 'pos')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Taken from the verified token, never the body. The audit trail is the
  // whole defence against a forced discount at the counter — the register
  // prices locally, so who did it is the only check there is. A cashier able
  // to name someone else could take money off and pin it on a colleague.
  const redeemedBy = user.id

  const admin = createAdminClient()

  // The branch the burn is attributed to: a branch-locked cashier's own
  // (naming another is refused), or for a store-wide account one of the
  // store's branches or none. The body only ever proposes. A store-wide sale
  // naming a branch that isn't the store's is burned under no branch rather
  // than refused: the customer has already paid, and a refused burn would
  // leave the code unspent.
  const requestedOutlet =
    typeof body?.outletId === 'string' && body.outletId.trim() !== '' ? body.outletId : null
  let outlet: Awaited<ReturnType<typeof resolveRouteOutlet>>
  try {
    outlet = await resolveRouteOutlet(admin, appUser, tenantId, requestedOutlet)
  } catch (error) {
    console.error('[vouchers/redeem] branch lookup failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Could not check the branch. Try again.' }, { status: 503 })
  }
  if (!outlet.ok && outlet.status !== 400) return outletRefusal(outlet)
  const outletId = outlet.ok ? outlet.outletId : null

  const customerKey =
    typeof body?.customerKey === 'string' && body.customerKey.trim() !== ''
      ? body.customerKey
      : null

  // Sequential rather than concurrent: each burn is a conditional UPDATE on a
  // voucher row, and two of this order's codes could be the same voucher.
  const results = []
  for (const redemption of redemptions) {
    const result = await redeemVoucher(admin, {
      tenantId,
      voucherId: redemption.voucherId,
      orderId,
      amount: redemption.amount,
      channel: channel as VoucherChannel,
      customerKey,
      outletId,
      redeemedBy,
    })

    results.push({
      voucherId: redemption.voucherId,
      redeemed: result.redeemed,
      ...(result.error ? { error: result.error } : {}),
    })
  }

  return NextResponse.json({ success: true, results })
}
