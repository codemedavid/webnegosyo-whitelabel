/**
 * Who sends a reward code: the store's gateway phone, Semaphore, or nobody.
 *
 * A phone that polls proves it can send (each authorized claim is a heartbeat,
 * see migration 20261004120000). The phone is preferred because it is free;
 * Semaphore is the store's paid fallback for when every phone is off; and when
 * neither exists the customer is told so instead of waiting for a code that
 * will never leave.
 *
 * Trusted server only: the decrypted phone and code exist in memory for one
 * Semaphore call and are never logged or returned.
 */
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { createLoyaltyClaimCrypto } from './claim-crypto'
import { loyaltyOtpTemplate } from './otp-message'
import type { SemaphoreConfig, SemaphoreSendResult } from './semaphore'

/** Phones poll every 5s, 30s after a failure; a minute of silence means offline. */
export const GATEWAY_ONLINE_WINDOW_SECONDS = 60

export type OtpSender = 'gateway' | 'semaphore' | 'none'
export interface OtpRouting {
  sender: OtpSender
  semaphore: SemaphoreConfig | null
}

// Method syntax (not a function property) so the typed service-role client fits,
// as in sms-dispatch.ts: these RPCs are newer than the generated types.
interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export function chooseOtpSender({ gatewayOnline, hasSemaphore }: { gatewayOnline: boolean; hasSemaphore: boolean }): OtpSender {
  if (gatewayOnline) return 'gateway'
  return hasSemaphore ? 'semaphore' : 'none'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export interface GatewayStatus {
  gatewayOnline: boolean
  lastSeenAt: string | null
}

/** Heartbeat read; null when it could not be read (never "offline"). */
export async function readGatewayStatus(database: RpcClient, tenantId: string): Promise<GatewayStatus | null> {
  try {
    const { data, error } = await database.rpc('loyalty_sms_sender_status', {
      p_tenant_id: tenantId,
      p_window_seconds: GATEWAY_ONLINE_WINDOW_SECONDS,
    })
    if (error || !isRecord(data) || data.ok !== true) return null
    return {
      gatewayOnline: data.gatewayOnline === true,
      lastSeenAt: typeof data.lastSeenAt === 'string' ? data.lastSeenAt : null,
    }
  } catch {
    return null
  }
}

export async function loadOtpRouting(
  tenantId: string,
  { database, readFallback }: { database: RpcClient; readFallback: (tenantId: string) => Promise<SemaphoreConfig | null> },
): Promise<OtpRouting> {
  const status = await readGatewayStatus(database, tenantId)
  if (status?.gatewayOnline) return { sender: 'gateway', semaphore: null }
  let semaphore: SemaphoreConfig | null = null
  try {
    semaphore = await readFallback(tenantId)
  } catch {
    semaphore = null
  }
  if (!status) {
    // Unknown is not "offline". With a fallback, deliver through it (a phone
    // that is in fact online simply loses the race — SQL keeps one sender).
    // Without one, queue for a phone as before rather than refuse the claim.
    return semaphore ? { sender: 'semaphore', semaphore } : { sender: 'gateway', semaphore: null }
  }
  return { sender: chooseOtpSender({ gatewayOnline: false, hasSemaphore: semaphore !== null }), semaphore }
}

export type ServerDispatchOutcome = 'sent' | 'failed' | 'not_started' | 'sent_unrecorded'

/**
 * Take the queued job for this challenge, send it through Semaphore, record
 * the outcome. `not_started` means a phone got there first — which is fine:
 * SQL guarantees exactly one sender.
 */
export async function dispatchOtpViaSemaphore(
  input: { tenantId: string; challengeId: string; storeName: string | null },
  deps: {
    database: RpcClient
    crypto: ReturnType<typeof createLoyaltyClaimCrypto>
    semaphore: SemaphoreConfig
    send: (config: SemaphoreConfig, message: { phone: string; code: string; template: string }) => Promise<SemaphoreSendResult>
  },
): Promise<ServerDispatchOutcome> {
  const { data, error } = await deps.database.rpc('begin_loyalty_sms_server_dispatch', {
    p_tenant_id: input.tenantId,
    p_challenge_id: input.challengeId,
  })
  if (error || !isRecord(data) || data.ok !== true || typeof data.jobId !== 'string' || typeof data.payloadEncrypted !== 'string') {
    return 'not_started'
  }
  const jobId = data.jobId
  let result: SemaphoreSendResult
  try {
    const payload = deps.crypto.decryptSms({ tenantId: input.tenantId, challengeId: input.challengeId }, data.payloadEncrypted)
    result = await deps.send(deps.semaphore, { ...payload, template: loyaltyOtpTemplate(input.storeName) })
  } catch {
    result = { ok: false, reason: 'rejected' }
  }
  const outcome = result.ok ? 'sent' : 'failed'
  try {
    const finished = await deps.database.rpc('finish_loyalty_sms_server_dispatch', {
      p_tenant_id: input.tenantId,
      p_job_id: jobId,
      p_outcome: outcome,
    })
    if (finished.error || !isRecord(finished.data) || finished.data.ok !== true) {
      return outcome === 'sent' ? 'sent_unrecorded' : 'failed'
    }
  } catch {
    return outcome === 'sent' ? 'sent_unrecorded' : 'failed'
  }
  return outcome
}

/** The store name printed in the SMS; null (generic wording) if it can't be read. */
export async function readLoyaltyStoreName(client: SupabaseClient<Database>, tenantId: string): Promise<string | null> {
  try {
    const { data, error } = await client.from('tenants').select('name').eq('id', tenantId).maybeSingle()
    return error || typeof data?.name !== 'string' ? null : data.name
  } catch {
    return null
  }
}
