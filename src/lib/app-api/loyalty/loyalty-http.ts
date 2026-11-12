import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextResponse } from 'next/server'
import { appRewardClaimRequestSchema, type AppLoyalty, type AppRewardClaim } from '@/lib/app-contract'
import type { AppRouteContext } from '@/lib/app-api/app-route'
import { gateAppCustomer, type CustomerBudgets } from '@/lib/app-api/delivery/customer-gate'
import { readAppJson } from '@/lib/app-api/request-body'
import { appFail, appOk } from '@/lib/app-api/respond'
import { AppReadError } from '@/lib/app-api/store-reads'
import { readLoyaltyActivity } from '@/lib/loyalty/activity-repository'
import { loadLoyaltyClaimCrypto } from '@/lib/loyalty/server-keys'
import { ensurePass } from '@/lib/loyalty/wallet-pass/pass-repository'
import { createPassSerial, encodeMemberCode } from '@/lib/loyalty/wallet-pass/member-code'
import { ADMIN_QUERY_TIMEOUT_MS, createAdminClient } from '@/lib/supabase/admin'
import { APP_ACTIVITY_LIMIT, memberProgramId, projectActivity, projectPrograms, projectRewards } from './project-loyalty'

/**
 * GET  /api/app/v1/me/loyalty         → AppLoyalty (the signed-in customer's card)
 * POST /api/app/v1/me/loyalty/claims  {rewardId} → AppRewardClaim (a 2-minute reward QR)
 *
 * The session proved the phone by SMS at sign-in, so "Use now" needs no second
 * code (owner, 2026-11-12). Both RPCs re-check the session themselves; the
 * route never trusts a customer id it was handed.
 */

/** The Rewards screen re-reads on focus, and every 5 s while a claim QR is open. */
export const LOYALTY_READ_BUDGETS: CustomerBudgets = {
  bucket: 'app-loyalty',
  burst: { limit: 60, windowSec: 60 },
  daily: { limit: 3000, windowSec: 86_400 },
}

/** Claims are also capped in the database (6 per session per 10 min). */
export const LOYALTY_CLAIM_BUDGETS: CustomerBudgets = {
  bucket: 'app-loyalty-claim',
  burst: { limit: 6, windowSec: 60 },
  daily: { limit: 60, windowSec: 86_400 },
}

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const CLAIM_REFUSED = 'This reward can’t be used right now. Pull to refresh and try again.'
const CLAIM_BUSY = 'You asked for a lot of reward codes just now. Please wait a few minutes.'
const CLAIMS_OFF = 'Show this reward to the cashier and they’ll apply it for you.'
const UNREADABLE = "We couldn't read that reward. Please update the app and try again."

const admin = () => createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }) as unknown as SupabaseClient

/** Same env gates as the web claim, minus SMS: the app needs no text to claim. */
export function areAppClaimsAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return env.LOYALTY_PUBLIC_CLAIMS_ENABLED === 'true' && env.LOYALTY_POS_SETTLEMENT_ENABLED === 'true'
}

type Row = Record<string, unknown>

interface WalletRead {
  live: boolean
  customerKey: string | null
  programs: Row[]
  rewards: Row[]
}

export interface LoyaltyDeps {
  readWallet(tenantId: string, tokenHash: string): Promise<WalletRead | null>
  readActivity(tenantId: string, customerKey: string): ReturnType<typeof readLoyaltyActivity>
  ensureMemberCode(tenantId: string, programId: string, customerKey: string): Promise<string>
  issueClaim(tenantId: string, tokenHash: string, rewardId: string): Promise<AppRewardClaim | 'refused' | 'rate_limited' | 'off'>
  claimsAvailable(): boolean
}

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : [])

export function liveLoyaltyDeps(): LoyaltyDeps {
  return {
    async readWallet(tenantId, tokenHash) {
      const { data, error } = await admin().rpc('app_customer_loyalty', { p_tenant_id: tenantId, p_session_token_hash: tokenHash })
      if (error) throw new AppReadError('loyalty', error.message)
      if (!isRow(data)) throw new AppReadError('loyalty', 'unexpected wallet shape')
      if (data.ok !== true) return null
      return {
        live: data.live === true,
        customerKey: typeof data.customerKey === 'string' ? data.customerKey : null,
        programs: rows(data.programs),
        rewards: rows(data.rewards),
      }
    },
    readActivity: (tenantId, customerKey) =>
      readLoyaltyActivity(admin(), tenantId, { limit: APP_ACTIVITY_LIMIT, customerKey }),
    async ensureMemberCode(tenantId, programId, customerKey) {
      const pass = await ensurePass(admin(), { tenantId, programId, customerKey }, () => createPassSerial())
      return encodeMemberCode(pass.serial_number)
    },
    async issueClaim(tenantId, tokenHash, rewardId) {
      const crypto = loadLoyaltyClaimCrypto()
      if (!crypto) return 'off'
      const claim = crypto.createClaim(tenantId)
      const { data, error } = await admin().rpc('issue_app_loyalty_claim', {
        p_tenant_id: tenantId,
        p_session_token_hash: tokenHash,
        p_entitlement_id: rewardId,
        p_claim_token_hash: claim.tokenHash,
      })
      if (error) throw new AppReadError('reward claim', error.message)
      if (!isRow(data)) throw new AppReadError('reward claim', 'unexpected claim shape')
      if (data.ok !== true) return data.error === 'rate_limited' ? 'rate_limited' : 'refused'
      if (typeof data.expiresAt !== 'string') throw new AppReadError('reward claim', 'claim without expiry')
      return { token: claim.token, expiresAt: new Date(data.expiresAt).toISOString() }
    },
    claimsAvailable: () => areAppClaimsAvailable() && loadLoyaltyClaimCrypto() !== null,
  }
}

const EMPTY: Omit<AppLoyalty, 'claimsAvailable'> = { memberCode: null, programs: [], rewards: [], activity: [] }

/** The card. Signed out → 401 like /me; loyalty off → an empty card (the app shows "join"). */
export async function handleGetLoyalty(context: AppRouteContext, deps: LoyaltyDeps = liveLoyaltyDeps()): Promise<NextResponse> {
  const gate = await gateAppCustomer(context, LOYALTY_READ_BUDGETS)
  if (!gate.ok) return gate.response
  const { tenantId } = context.app

  const wallet = await deps.readWallet(tenantId, gate.tokenHash)
  if (!wallet) return appFail('unauthorized', 'Please sign in again.')
  if (!wallet.live || !wallet.customerKey) return appOk({ ...EMPTY, claimsAvailable: false } satisfies AppLoyalty, { headers: NO_STORE })

  const programId = memberProgramId(wallet.programs)
  const [memberCode, activity] = await Promise.all([
    programId ? deps.ensureMemberCode(tenantId, programId, wallet.customerKey) : Promise.resolve(null),
    deps.readActivity(tenantId, wallet.customerKey).catch((error: unknown) => {
      // History is a nicety; the card itself must still load.
      console.error('[app-api:loyalty] activity unreadable', { tenantId, message: error instanceof Error ? error.message : String(error) })
      return { events: [], nextCursor: null }
    }),
  ])

  const loyalty: AppLoyalty = {
    memberCode,
    programs: projectPrograms(wallet.programs),
    rewards: projectRewards(wallet.rewards),
    activity: projectActivity(activity.events),
    claimsAvailable: deps.claimsAvailable(),
  }
  return appOk(loyalty, { headers: NO_STORE })
}

/** "Use now": a single-use claim QR for one of the customer's own rewards. The token is never logged. */
export async function handleClaimReward(context: AppRouteContext, deps: LoyaltyDeps = liveLoyaltyDeps()): Promise<NextResponse> {
  const gate = await gateAppCustomer(context, LOYALTY_CLAIM_BUDGETS)
  if (!gate.ok) return gate.response

  const parsed = appRewardClaimRequestSchema.safeParse(await readAppJson(context.request))
  if (!parsed.success) return appFail('bad_request', UNREADABLE)
  if (!deps.claimsAvailable()) return appFail('refused', CLAIMS_OFF)

  const outcome = await deps.issueClaim(context.app.tenantId, gate.tokenHash, parsed.data.rewardId.toLowerCase())
  if (outcome === 'off') return appFail('refused', CLAIMS_OFF)
  if (outcome === 'rate_limited') return appFail('rate_limited', CLAIM_BUSY, { retryAfterSec: 600 })
  if (outcome === 'refused') return appFail('refused', CLAIM_REFUSED)
  return appOk(outcome, { status: 201, headers: NO_STORE })
}
