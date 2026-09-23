/**
 * The two things a merchant may do to a customer's card by hand.
 *
 * Both are audited or refused. An adjustment writes a ledger row carrying the
 * reason; settling a reward stamps who did it and why onto the entitlement.
 *
 * Every adjustment carries a caller-minted `requestId`. The duplicate defence
 * for earning is the ORDER reference, and an adjustment has no order — without
 * a request id, a double tap on a flaky connection wrote two ledger rows and
 * doubled someone's stamps. The database holds the other end with a partial
 * unique index, so a replay is refused there even if two servers race.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseLoyaltyRules } from './rules'
import { snapshotRewardTerms } from './versioning'
import type { LoyaltyEntitlementTerms } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_ADJUSTMENT = 10_000
const MAX_NOTE = 500
const CUSTOMER_KEY_RE = /^(phone:\+\d{6,15}|email:[^\s@]+@[^\s@]+)$/
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

export interface BalanceAdjustmentInput {
  programId: string
  customerKey: string
  delta: number
  note: string
  requestId: string
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** An adjustment is auditable and replay-safe, or it is refused. */
export function parseBalanceAdjustment(raw: unknown): ParseResult<BalanceAdjustmentInput> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'An adjustment is required.' }
  const input = raw as Record<string, unknown>

  const programId = text(input.programId)
  if (!programId) return { ok: false, error: 'Choose which card to adjust.' }

  const customerKey = text(input.customerKey)
  if (!CUSTOMER_KEY_RE.test(customerKey)) {
    return { ok: false, error: 'That customer could not be identified.' }
  }

  const delta = Number(input.delta)
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: 'Enter how many to add or take away.' }
  }
  if (Math.abs(delta) > MAX_ADJUSTMENT) {
    return { ok: false, error: `Adjustments are limited to ${MAX_ADJUSTMENT} at a time.` }
  }

  const note = text(input.note)
  if (!note) return { ok: false, error: 'Say why you are changing this balance.' }
  if (note.length > MAX_NOTE) return { ok: false, error: `Keep the reason under ${MAX_NOTE} characters.` }

  const requestId = text(input.requestId)
  if (!REQUEST_ID_RE.test(requestId)) {
    return { ok: false, error: 'This request is missing its identifier. Please retry.' }
  }

  return { ok: true, value: { programId, customerKey, delta, note, requestId } }
}

export type RewardAction = 'consume' | 'void'

export interface RewardResolutionInput {
  entitlementId: string
  action: RewardAction
  note: string
}

export function parseRewardResolution(raw: unknown): ParseResult<RewardResolutionInput> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'A reward is required.' }
  const input = raw as Record<string, unknown>

  const entitlementId = text(input.entitlementId)
  if (!entitlementId) return { ok: false, error: 'Choose which reward to settle.' }

  const action = text(input.action)
  if (action !== 'consume' && action !== 'void') {
    return { ok: false, error: 'Say whether the reward was used or is being cancelled.' }
  }

  const note = text(input.note)
  if (!note) return { ok: false, error: 'Say what happened to this reward.' }
  if (note.length > MAX_NOTE) return { ok: false, error: `Keep the reason under ${MAX_NOTE} characters.` }

  return { ok: true, value: { entitlementId, action, note } }
}

/**
 * The reward terms an adjustment should mint with, if it crosses the threshold.
 *
 * Read from the program's CURRENT version, exactly as a real visit would: a
 * hand-added stamp that completes a card must hand over the reward the store
 * offers today, frozen the moment it is issued.
 */
export async function loadAdjustmentTerms(
  client: SupabaseClient,
  tenantId: string,
  programId: string,
  nowMs: number
): Promise<
  | {
      ok: true
      versionId: string | null
      threshold: number
      terms: LoyaltyEntitlementTerms | null
      expiresAt: string | null
    }
  | { ok: false; error: string }
> {
  const { data, error } = await client
    .from('loyalty_programs')
    .select('id, name, current_version_id')
    .eq('tenant_id', tenantId)
    .eq('id', programId)
    .maybeSingle()

  if (error) throw new Error(`Program could not be read: ${error.message}`)
  const program = data as { id: string; name: string; current_version_id: string | null } | null
  if (!program) return { ok: false, error: 'That program is not part of this store.' }

  if (!program.current_version_id) {
    // A program with no rules cannot mint anything. The adjustment still
    // applies — the stamps are real — it simply issues nothing.
    return { ok: true, versionId: null, threshold: 0, terms: null, expiresAt: null }
  }

  const { data: versionRow, error: versionError } = await client
    .from('loyalty_program_versions')
    .select('id, version, rules')
    .eq('id', program.current_version_id)
    .maybeSingle()
  if (versionError) throw new Error(`Reward rules could not be read: ${versionError.message}`)

  const version = versionRow as { id: string; version: number; rules: unknown } | null
  const parsed = version ? parseLoyaltyRules(version.rules) : null
  if (!version || !parsed?.ok) {
    return { ok: true, versionId: version?.id ?? null, threshold: 0, terms: null, expiresAt: null }
  }

  const rules = parsed.value
  return {
    ok: true,
    versionId: version.id,
    threshold: rules.threshold,
    terms: snapshotRewardTerms({
      id: program.id,
      name: program.name,
      versionNumber: version.version,
      rules,
    }),
    expiresAt:
      rules.rewardExpiryDays == null
        ? null
        : new Date(nowMs + rules.rewardExpiryDays * DAY_MS).toISOString(),
  }
}

export interface AdjustmentOutcome {
  applied: boolean
  /** `duplicate` when the same requestId already landed. */
  reason: string | null
  balance: number | null
  rewardsIssued: number
}

/** Apply one audited adjustment. Replays are reported, never re-applied. */
export async function adjustMemberBalance(
  client: SupabaseClient,
  tenantId: string,
  input: BalanceAdjustmentInput,
  actor: string | null,
  nowMs = Date.now()
): Promise<AdjustmentOutcome | { error: string }> {
  const terms = await loadAdjustmentTerms(client, tenantId, input.programId, nowMs)
  if (!terms.ok) return { error: terms.error }

  const { data, error } = await client.rpc('apply_loyalty_earning', {
    p_tenant_id: tenantId,
    p_program_id: input.programId,
    p_version_id: terms.versionId,
    p_customer_key: input.customerKey,
    p_customer_id: null,
    p_kind: 'correction',
    p_delta: input.delta,
    p_order_backend: null,
    p_external_order_id: null,
    p_threshold: terms.threshold > 0 ? terms.threshold : null,
    p_reward_terms: terms.terms,
    p_reward_expires_at: terms.expiresAt,
    p_shadow: false,
    p_actor: actor,
    p_note: input.note,
    p_request_id: input.requestId,
  })

  if (error) throw new Error(`Balance adjustment failed: ${error.message}`)

  const result = (data ?? {}) as {
    applied?: boolean
    reason?: string
    balance?: number
    entitlementsIssued?: number
  }
  return {
    applied: result.applied === true,
    reason: result.reason ?? null,
    balance: typeof result.balance === 'number' ? result.balance : null,
    rewardsIssued: Number(result.entitlementsIssued) || 0,
  }
}

export interface RewardResolutionOutcome {
  applied: boolean
  status: string | null
  reason: string | null
}

/** Mark a reward used, or cancel it. Refused while a register holds it. */
export async function resolveMemberReward(
  client: SupabaseClient,
  tenantId: string,
  input: RewardResolutionInput,
  actor: string | null
): Promise<RewardResolutionOutcome> {
  const { data, error } = await client.rpc('resolve_loyalty_entitlement', {
    p_tenant_id: tenantId,
    p_entitlement_id: input.entitlementId,
    p_action: input.action,
    p_actor: actor,
    p_note: input.note,
  })

  if (error) throw new Error(`Reward could not be settled: ${error.message}`)

  const result = (data ?? {}) as { applied?: boolean; status?: string; reason?: string }
  return {
    applied: result.applied === true,
    status: result.status ?? null,
    reason: result.reason ?? null,
  }
}

/** What to tell a merchant when the database refuses. */
export function describeResolutionRefusal(reason: string | null): string {
  switch (reason) {
    case 'not_found':
      return 'That reward no longer exists.'
    case 'reserved':
      return 'A register is using this reward right now. Finish or cancel that sale first.'
    case 'already_consumed':
      return 'This reward was already marked as used.'
    case 'already_voided':
      return 'This reward was already cancelled.'
    case 'not_settleable':
      return 'This reward has already been settled and cannot be changed.'
    default:
      return 'That reward could not be settled. Please reload and try again.'
  }
}
