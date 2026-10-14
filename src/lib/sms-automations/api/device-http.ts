/**
 * The sending phone's door to automated texts:
 *   POST /api/sms/outbox/claim  → one text to send now, or how long to wait
 *   POST /api/sms/outbox/finish → what happened to it
 *
 * Same enrolled phone and credential as the loyalty reward-code gateway
 * (`loyalty_sms_devices`), but marketing texts need the `customers`
 * permission, not loyalty. The claim RPC re-checks consent, exits, caps,
 * quiet hours and pacing, and releases each body ONCE. Nothing here logs a
 * phone, a body or a credential. Server-only.
 */

import 'server-only'
import { after, type NextRequest, type NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashDeviceCredential } from '@/lib/loyalty/device-credential'
import { authenticateMerchant, hasExactKeys, isRecord, isUuid, readBody, respond, unavailable } from '@/lib/loyalty/merchant-http'
import { hasPermission } from '@/lib/staff-permissions'
import { MAX_BODY_CHARS } from '../planner'
import { PHONE_INFO_HEADER, parsePhoneInfoHeader } from '@/lib/texts/phone-info'
import { recordPhoneInfo } from '@/lib/texts/server/phones'

export const OUTBOX_ACTIONS = ['claim', 'finish'] as const
const WAIT_REASONS = new Set(['no_job', 'quiet_hours', 'daily_limit', 'paced'])
const UNAVAILABLE = 'Texts could not be fetched. The phone will try again.'
const E164 = /^\+[1-9]\d{6,14}$/
const ERROR_CODE = /^[a-z0-9_]{1,40}$/

const isCredential = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const isOutcome = (value: unknown) => value === 'sent' || value === 'failed'
const isErrorCode = (value: unknown) => value === undefined || (typeof value === 'string' && ERROR_CODE.test(value))

function isEnabled(): boolean {
  return process.env.LOYALTY_SMS_DELIVERY_ENABLED === 'true'
}

function validBody(action: string, body: unknown): boolean {
  const identity = { tenantId: isUuid, deviceId: isUuid, credential: isCredential }
  if (action === 'claim') return hasExactKeys(body, identity)
  const finish = { ...identity, messageId: isUuid, leaseToken: isUuid, outcome: isOutcome }
  return hasExactKeys(body, finish) || hasExactKeys(body, { ...finish, error: isErrorCode })
}

function claimResponse(data: unknown): NextResponse {
  if (!isRecord(data)) return unavailable(UNAVAILABLE)
  if (data.ok === true) {
    const { messageId, leaseToken, phone, body } = data
    const isSane = isUuid(messageId) && isUuid(leaseToken) && typeof phone === 'string' && E164.test(phone)
      && typeof body === 'string' && body.length > 0 && body.length <= MAX_BODY_CHARS
    // A malformed row is never handed to a SIM; the sweep fails it as unconfirmed.
    if (!isSane) return unavailable(UNAVAILABLE)
    return respond({ message: { messageId, leaseToken, phone, body }, wait: null }, 200)
  }
  if (data.error === 'request_denied') return respond({ error: 'Forbidden' }, 403)
  if (typeof data.error === 'string' && WAIT_REASONS.has(data.error)) {
    const retry = data.retryAt ?? data.nextAt
    const retryAt = typeof retry === 'string' && Number.isFinite(Date.parse(retry)) ? retry : null
    return respond({ message: null, wait: { reason: data.error, retryAt } }, 200)
  }
  return unavailable(UNAVAILABLE)
}

type Database = ReturnType<typeof createAdminClient>

/**
 * What the phone says about itself (`x-wn-phone-info`), saved for the web's
 * Texts page. Only after the claim RPC accepted the device credential, so a
 * forged header cannot write. Fire-and-forget: it never fails or slows the
 * claim (`recordPhoneInfo` never throws; `after` keeps the function alive).
 */
function recordPhoneReport(request: NextRequest, database: Database, tenantId: string, deviceId: string, claim: unknown): void {
  if (!isRecord(claim) || claim.error === 'request_denied') return
  const info = parsePhoneInfoHeader(request.headers.get(PHONE_INFO_HEADER))
  if (!info) return
  const pending = recordPhoneInfo(database, tenantId, deviceId, info)
  try {
    after(() => pending)
  } catch {
    // Outside a request scope (tests, scripts): the write is already running.
  }
}

export async function handleOutboxDelivery(request: NextRequest, action: string): Promise<NextResponse> {
  if (!isEnabled()) return respond({ error: 'Texting from this phone is not available yet.' }, 503)
  if (!(OUTBOX_ACTIONS as readonly string[]).includes(action)) return respond({ error: 'Not found' }, 404)
  const body = await readBody(request)
  if (!validBody(action, body)) return respond({ error: 'Malformed request.' }, 400)
  const fields = body as Record<string, unknown>
  const tenantId = (fields.tenantId as string).toLowerCase()
  const credentialHash = hashDeviceCredential(fields.credential)
  if (!credentialHash) return respond({ error: 'Malformed request.' }, 400)

  const auth = await authenticateMerchant(request, tenantId)
  if (!auth.ok) return auth.response
  if (!hasPermission(auth.member, 'customers')) return respond({ error: 'Forbidden' }, 403)

  const identity = {
    p_tenant_id: tenantId, p_actor_id: auth.userId,
    p_device_id: (fields.deviceId as string).toLowerCase(), p_credential_hash: credentialHash,
  }
  try {
    const database = createAdminClient({ timeoutMs: 8000 })
    if (action === 'claim') {
      const { data, error } = await database.rpc('claim_sms_outbox_message', identity)
      if (error) return unavailable(UNAVAILABLE)
      recordPhoneReport(request, database, tenantId, identity.p_device_id, data)
      return claimResponse(data)
    }
    const { data, error } = await database.rpc('finish_sms_outbox_message', {
      ...identity,
      p_message_id: (fields.messageId as string).toLowerCase(),
      p_lease_token: (fields.leaseToken as string).toLowerCase(),
      p_outcome: fields.outcome as string,
      // The SQL takes NULL for "no detail"; the generated types do not say so.
      p_error: ((fields.error as string | undefined) ?? null) as string,
    })
    if (error) return unavailable(UNAVAILABLE)
    // A refused report (stale token, revoked phone) is "not applied"; the next claim's 403 stops a revoked phone.
    return respond({ applied: isRecord(data) && data.ok === true }, 200)
  } catch {
    return unavailable(UNAVAILABLE)
  }
}
