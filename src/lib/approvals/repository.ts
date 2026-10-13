/**
 * Service-role I/O for approvals. Every write is an RPC into the SECURITY
 * DEFINER functions of 20261012160000_approvals.sql — the tables grant no
 * INSERT/UPDATE to anyone, the service role included. Reads are bounded.
 *
 * The client is typed loosely on purpose: the generated Database types are
 * regenerated only once the migration is applied (CLAUDE.md), and this module
 * must compile before that.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOrderBackend, type OrderBackend } from '@/lib/order-backend'
import { normalizeRules } from './rules'
import type { ApprovalRules } from './types'
import type { ApproverCandidate, DeviceToken } from './push'

export type ApprovalsDb = Pick<SupabaseClient, 'from' | 'rpc'>

/** Hard ceiling on any list this module reads (the API cap is 1000). */
export const APPROVALS_LIST_LIMIT = 100
const UNDEFINED_COLUMN = '42703'

export type RpcOutcome = { ok: true; [key: string]: unknown } | { ok: false; code: string; message: string; [key: string]: unknown }

async function callRpc(db: ApprovalsDb, fn: string, args: Record<string, unknown>): Promise<RpcOutcome> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(`${fn} failed: ${error.message}`)
  if (!data || typeof data !== 'object') throw new Error(`${fn} returned nothing`)
  return data as RpcOutcome
}

export async function loadTenantBackend(db: ApprovalsDb, tenantId: string): Promise<OrderBackend | null> {
  const { data, error } = await db
    .from('tenants')
    .select('order_backend, convex_deployment_url')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw new Error(`Store could not be read: ${error.message}`)
  if (!data) return null
  return resolveOrderBackend(data as { order_backend?: null; convex_deployment_url?: string | null })
}

export async function loadRules(db: ApprovalsDb, tenantId: string): Promise<ApprovalRules> {
  const { data, error } = await db.rpc('approval_rules_effective', { p_tenant_id: tenantId })
  if (error) throw new Error(`Approval rules could not be read: ${error.message}`)
  return normalizeRules(data)
}

export interface QuoteArgs {
  tenantId: string
  userId: string
  kind: string
  orderId: string | null
  payload: Record<string, unknown>
}

export function quoteRequest(db: ApprovalsDb, args: QuoteArgs): Promise<RpcOutcome> {
  return callRpc(db, 'approval_quote', {
    p_tenant_id: args.tenantId,
    p_user_id: args.userId,
    p_kind: args.kind,
    p_external_order_id: args.orderId,
    p_payload: args.payload,
  })
}

export interface CreateArgs extends QuoteArgs {
  reasonCode: string
  note: string | null
  idempotencyKey: string
}

/** Pending request (someone must answer). */
export function createPendingRequest(db: ApprovalsDb, args: CreateArgs): Promise<RpcOutcome> {
  return callRpc(db, 'create_approval_request', {
    p_tenant_id: args.tenantId,
    p_user_id: args.userId,
    p_kind: args.kind,
    p_external_order_id: args.orderId,
    p_payload: args.payload,
    p_reason_code: args.reasonCode,
    p_note: args.note,
    p_idempotency_key: args.idempotencyKey,
    p_direct: false,
  })
}

/** Within the requester's own limit: recorded and executed in one transaction. */
export function createAndExecuteDirect(db: ApprovalsDb, args: CreateArgs): Promise<RpcOutcome> {
  return callRpc(db, 'create_and_execute_approval', {
    p_tenant_id: args.tenantId,
    p_user_id: args.userId,
    p_kind: args.kind,
    p_external_order_id: args.orderId,
    p_payload: args.payload,
    p_reason_code: args.reasonCode,
    p_note: args.note,
    p_idempotency_key: args.idempotencyKey,
  })
}

export interface DecideArgs {
  tenantId: string
  requestId: string
  actorId: string
  decision: 'approve' | 'decline'
  reasonCode: string | null
  note: string | null
  amountOverride: number | null
}

export function decideRequest(db: ApprovalsDb, args: DecideArgs): Promise<RpcOutcome> {
  return callRpc(db, 'decide_approval', {
    p_id: args.requestId,
    p_tenant_id: args.tenantId,
    p_actor: args.actorId,
    p_decision: args.decision,
    p_reason_code: args.reasonCode,
    p_note: args.note,
    p_approved_amount: args.amountOverride,
  })
}

export function withdrawRequest(db: ApprovalsDb, tenantId: string, requestId: string, actorId: string): Promise<RpcOutcome> {
  return callRpc(db, 'withdraw_approval', { p_id: requestId, p_tenant_id: tenantId, p_actor: actorId })
}

/** Lazy expiry: cheap (indexed on pending + expires_at), bounded. Never throws. */
export async function expireDue(db: ApprovalsDb, tenantId: string): Promise<number> {
  const { data, error } = await db.rpc('expire_approval_requests', { p_tenant_id: tenantId, p_limit: 200 })
  if (error) {
    console.error('[approvals] expiry sweep failed', { tenantId, error: error.message })
    return 0
  }
  return typeof data === 'number' ? data : 0
}

export async function recordSideEffects(
  db: ApprovalsDb,
  tenantId: string,
  requestId: string,
  sideEffects: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.rpc('record_approval_side_effects', {
    p_id: requestId,
    p_tenant_id: tenantId,
    p_side_effects: sideEffects,
  })
  if (error) console.error('[approvals] side effects not recorded', { requestId, error: error.message })
}

export function saveRules(
  db: ApprovalsDb,
  tenantId: string,
  actorId: string,
  rules: Record<string, unknown>,
): Promise<RpcOutcome> {
  return callRpc(db, 'set_approval_rules', { p_tenant_id: tenantId, p_actor: actorId, p_rules: rules })
}

export type ListFilter =
  | { kind: 'pending' }
  | { kind: 'mine'; userId: string }
  | { kind: 'recent'; sinceIso: string }
  | { kind: 'recent_mine'; userId: string; sinceIso: string }

export async function listRequests(db: ApprovalsDb, tenantId: string, filter: ListFilter): Promise<Record<string, unknown>[]> {
  let query = db.from('approval_requests').select('*').eq('tenant_id', tenantId)
  switch (filter.kind) {
    case 'pending':
      query = query.eq('status', 'pending').order('created_at', { ascending: true })
      break
    case 'mine':
      query = query.eq('requested_by', filter.userId).order('created_at', { ascending: false })
      break
    case 'recent':
      query = query.eq('is_direct', false).gte('updated_at', filter.sinceIso).neq('status', 'pending')
        .order('updated_at', { ascending: false })
      break
    case 'recent_mine':
      query = query.eq('requested_by', filter.userId).gte('updated_at', filter.sinceIso)
        .order('updated_at', { ascending: false })
      break
  }
  const { data, error } = await query.limit(APPROVALS_LIST_LIMIT)
  if (error) throw new Error(`Requests could not be read: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

/**
 * Executed refunds whose follow-ups (stock, pre-sell, loyalty) never reported
 * back — claimed atomically (marked running) so two sweeps never both run them.
 */
export async function claimSideEffectsDue(
  db: ApprovalsDb,
  tenantId: string | null,
  limit = 5,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await db.rpc('claim_approval_side_effects', { p_tenant_id: tenantId, p_limit: limit })
  if (error) {
    console.error('[approvals] side-effect sweep failed', { tenantId, error: error.message })
    return []
  }
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : []
}

export async function getRequestRow(db: ApprovalsDb, tenantId: string, requestId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('approval_requests')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', requestId)
    .maybeSingle()
  if (error) throw new Error(`Request could not be read: ${error.message}`)
  return (data ?? null) as Record<string, unknown> | null
}

/** Pending requests created since `sinceIso` (push batching). */
export async function listRecentPending(db: ApprovalsDb, tenantId: string, sinceIso: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await db
    .from('approval_requests')
    .select('id, kind, amount, outlet_id, requested_by, requested_by_name, created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .gte('created_at', sinceIso)
    .limit(APPROVALS_LIST_LIMIT)
  if (error) throw new Error(`Recent requests could not be read: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

/** The store's own accounts that might answer (owners + staff; filtered by the pure rules). */
export async function listApproverCandidates(db: ApprovalsDb, tenantId: string): Promise<ApproverCandidate[]> {
  const { data, error } = await db
    .from('app_users')
    .select('user_id, role, is_owner, permissions, outlet_id, display_name')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .limit(APPROVALS_LIST_LIMIT)
  if (error) throw new Error(`Store accounts could not be read: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    userId: String(row.user_id),
    role: String(row.role),
    isOwner: row.is_owner === true,
    permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : null,
    outletId: typeof row.outlet_id === 'string' ? row.outlet_id : null,
    displayName: typeof row.display_name === 'string' ? row.display_name : null,
  }))
}

/**
 * Devices of these people registered FOR THIS STORE (a superadmin who once
 * impersonated a store must not be rung for it). Tolerates the channels
 * column not existing yet (deployed before the migration is applied).
 */
export async function listDeviceTokens(db: ApprovalsDb, tenantId: string, userIds: readonly string[]): Promise<DeviceToken[]> {
  if (userIds.length === 0) return []
  const read = (projection: string) =>
    db.from('platform_device_tokens').select(projection).eq('tenant_id', tenantId).in('user_id', [...userIds]).limit(500)
  let { data, error } = await read('token, user_id, platform, channels')
  if (error?.code === UNDEFINED_COLUMN) ({ data, error } = await read('token, user_id, platform'))
  if (error) throw new Error(`Devices could not be read: ${error.message}`)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    token: String(row.token),
    userId: String(row.user_id),
    platform: String(row.platform),
    channels: Array.isArray(row.channels) ? (row.channels as string[]) : [],
  }))
}

export async function deleteDeviceTokens(db: ApprovalsDb, tokens: readonly string[]): Promise<void> {
  if (tokens.length === 0) return
  const { error } = await db.from('platform_device_tokens').delete().in('token', [...tokens])
  if (error) console.error('[approvals] stale token cleanup failed', error.message)
}

export interface OrderSideEffectFacts {
  id: string
  outletId: string | null
  customerData: unknown
  status: string
}

export async function loadOrderFacts(db: ApprovalsDb, tenantId: string, orderId: string): Promise<OrderSideEffectFacts | null> {
  const { data, error } = await db
    .from('orders')
    .select('id, outlet_id, customer_data, status')
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw new Error(`Order could not be read: ${error.message}`)
  if (!data) return null
  const row = data as Record<string, unknown>
  return {
    id: String(row.id),
    outletId: typeof row.outlet_id === 'string' ? row.outlet_id : null,
    customerData: row.customer_data,
    status: String(row.status),
  }
}
