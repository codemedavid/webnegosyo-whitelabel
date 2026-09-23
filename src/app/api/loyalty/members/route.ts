import { NextRequest, NextResponse } from 'next/server'
import { readBody } from '@/lib/loyalty/merchant-http'
import { authorizeLoyaltyMerchant, readTenantId } from '@/lib/loyalty/merchant-auth'
import type { LoyaltyMemberStatus } from '@/lib/loyalty/members'

/**
 * /api/loyalty/members — who holds a stamp card, and what a merchant may do to one.
 *
 *   GET  ?tenantId=…                       every member, ranked by who is closest
 *   GET  ?tenantId=…&customerKey=phone:+…  one member, with rewards, history and orders
 *   POST { tenantId, action }              adjust_balance | resolve_reward
 *
 * Same gate as `/api/loyalty/programs`: the caller's own token, the caller's own
 * tenant, and the `loyalty_manage` grant. The reads run service-role because the
 * ledger tables are deliberately unreadable to admins under RLS — a balance is
 * only ever shown through a surface that has already checked the grant.
 */

const VALID_STATUSES: readonly LoyaltyMemberStatus[] = [
  'reward_ready',
  'almost_there',
  'dormant',
  'new',
  'earning',
]

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

function readStatus(value: string | null): LoyaltyMemberStatus | null {
  const status = (value ?? '').trim() as LoyaltyMemberStatus
  return VALID_STATUSES.includes(status) ? status : null
}

function readLimit(value: string | null): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(Math.floor(parsed), MAX_LIMIT)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams
  const tenantId = readTenantId(params.get('tenantId'))
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 })

  const caller = await authorizeLoyaltyMerchant(request, tenantId)
  if (caller instanceof NextResponse) return caller

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { listLoyaltyMembers, readLoyaltyMemberDetail } = await import(
    '@/lib/loyalty/member-repository'
  )
  const admin = createAdminClient()

  try {
    const customerKey = readTenantId(params.get('customerKey'))
    if (customerKey) {
      const detail = await readLoyaltyMemberDetail(admin, tenantId, customerKey)
      if (!detail) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
      return NextResponse.json({ success: true, ...detail })
    }

    const page = await listLoyaltyMembers(admin, tenantId, {
      programId: readTenantId(params.get('programId')) || null,
      search: params.get('search'),
      status: readStatus(params.get('status')),
      limit: readLimit(params.get('limit')),
    })
    return NextResponse.json({ success: true, ...page })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Members could not be read.'
    console.error('[loyalty/members] GET', message)
    // A failed read must never render as "nobody is on the card yet".
    return NextResponse.json(
      { error: 'Your members could not be loaded. Please retry.' },
      { status: 503 }
    )
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await readBody(request)
  if (raw instanceof NextResponse) return raw
  const body = raw as Record<string, unknown> | null

  const tenantId = readTenantId(body?.tenantId)
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 })

  const caller = await authorizeLoyaltyMerchant(request, tenantId)
  if (caller instanceof NextResponse) return caller

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const management = await import('@/lib/loyalty/member-management')
  const admin = createAdminClient()

  try {
    switch (body?.action) {
      case 'adjust_balance': {
        const parsed = management.parseBalanceAdjustment(body.adjustment)
        if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

        const result = await management.adjustMemberBalance(
          admin,
          tenantId,
          parsed.value,
          caller.userId
        )
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

        // A replay is a success from the merchant's side: the change they asked
        // for is already in place. Saying "failed" would invite a second tap,
        // which is exactly what the request id exists to stop.
        return NextResponse.json({
          success: true,
          applied: result.applied,
          isDuplicate: result.reason === 'duplicate',
          balance: result.balance,
          rewardsIssued: result.rewardsIssued,
        })
      }

      case 'resolve_reward': {
        const parsed = management.parseRewardResolution(body.resolution)
        if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

        const result = await management.resolveMemberReward(
          admin,
          tenantId,
          parsed.value,
          caller.userId
        )
        if (!result.applied) {
          const isSettled =
            result.reason === 'already_consumed' || result.reason === 'already_voided'
          return NextResponse.json(
            { error: management.describeResolutionRefusal(result.reason), status: result.status },
            { status: isSettled ? 409 : result.reason === 'not_found' ? 404 : 409 }
          )
        }
        return NextResponse.json({ success: true, status: result.status })
      }

      default:
        return NextResponse.json(
          { error: 'action must be adjust_balance or resolve_reward.' },
          { status: 400 }
        )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Loyalty request failed.'
    console.error('[loyalty/members] POST', body?.action, message)
    return NextResponse.json(
      { error: 'That change could not be saved. Please reload and try again.' },
      { status: 503 }
    )
  }
}
