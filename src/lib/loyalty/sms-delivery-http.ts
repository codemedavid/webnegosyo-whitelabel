// HTTP adapter for the authorized Android-SIM OTP delivery path.
//
// The device presents its enrollment credential on every call; the server
// derives the registry hash and SQL re-checks tenant, actor, device, live mode
// and lease ownership under locks. Nothing here logs codes, phones, tokens,
// credentials or payloads, and every response is non-cacheable.
import 'server-only'
import { randomUUID } from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageStaff, hasPermission } from '@/lib/staff-permissions'
import { generateDeviceCredential, hashDeviceCredential } from './device-credential'
import { authenticateMerchant, hasExactKeys, isUuid, readBody, respond, unavailable } from './merchant-http'
import { loadLoyaltyClaimCrypto } from './server-keys'
import { authorizeLoyaltySmsDispatch } from './sms-dispatch'

export const SMS_DELIVERY_ACTIONS = ['claim', 'authorize', 'finish', 'recover'] as const
export type SmsDeliveryAction = (typeof SMS_DELIVERY_ACTIONS)[number]
type Outcome = 'sent' | 'failed'
type DeviceIdentity = { tenantId: string; deviceId: string; credentialHash: string }
type RpcResult = { data: unknown; error: unknown }

const UNAVAILABLE = 'Loyalty SMS delivery could not be confirmed. Retry the same request.'
const isCredential = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const isOutcome = (value: unknown): value is Outcome => value === 'sent' || value === 'failed'
const isRpcOk = (data: unknown) => typeof data === 'object' && data !== null && (data as { ok?: unknown }).ok === true
const isDenied = (data: unknown) =>
  typeof data === 'object' && data !== null && (data as { error?: unknown }).error === 'request_denied'

function isEnabled(): boolean {
  return process.env.LOYALTY_SMS_DELIVERY_ENABLED === 'true'
}

/** Owner-only: mints a fresh device ID and one-time credential for this tenant. */
export async function handleSmsDeviceEnroll(request: NextRequest): Promise<NextResponse> {
  if (!isEnabled()) return respond({ error: 'Loyalty SMS delivery is not available yet.' }, 503)
  const body = await readBody(request)
  if (!hasExactKeys(body, { tenantId: isUuid })) return respond({ error: 'A tenant is required.' }, 400)
  const tenantId = (body.tenantId as string).toLowerCase()
  const auth = await authenticateMerchant(request, tenantId)
  if (!auth.ok) return auth.response
  if (!canManageStaff(auth.member)) return respond({ error: 'Forbidden' }, 403)
  try {
    const deviceId = randomUUID()
    const { credential, credentialHash } = generateDeviceCredential()
    const { data, error } = await createAdminClient().rpc('enroll_loyalty_sms_device', {
      p_tenant_id: tenantId, p_actor_id: auth.userId, p_device_id: deviceId, p_credential_hash: credentialHash,
    })
    if (error) return unavailable(UNAVAILABLE)
    if (!isRpcOk(data)) return respond({ error: 'Device enrollment was refused.' }, 403)
    return respond({ success: true, device: { deviceId, credential } }, 200)
  } catch {
    return unavailable(UNAVAILABLE)
  }
}

/** Owner-only: permanently disables a device. Idempotent in SQL. */
export async function handleSmsDeviceRevoke(request: NextRequest): Promise<NextResponse> {
  if (!isEnabled()) return respond({ error: 'Loyalty SMS delivery is not available yet.' }, 503)
  const body = await readBody(request)
  if (!hasExactKeys(body, { tenantId: isUuid, deviceId: isUuid })) {
    return respond({ error: 'A tenant and device are required.' }, 400)
  }
  const tenantId = (body.tenantId as string).toLowerCase()
  const auth = await authenticateMerchant(request, tenantId)
  if (!auth.ok) return auth.response
  if (!canManageStaff(auth.member)) return respond({ error: 'Forbidden' }, 403)
  try {
    const { data, error } = await createAdminClient().rpc('revoke_loyalty_sms_device', {
      p_tenant_id: tenantId, p_actor_id: auth.userId, p_device_id: (body.deviceId as string).toLowerCase(),
    })
    if (error) return unavailable(UNAVAILABLE)
    if (!isRpcOk(data)) return respond({ error: 'Device revocation was refused.' }, 403)
    return respond({ success: true }, 200)
  } catch {
    return unavailable(UNAVAILABLE)
  }
}

/** One of claim / authorize / finish / recover, as the worker's API port expects. */
export async function handleSmsDelivery(request: NextRequest, action: string): Promise<NextResponse> {
  if (!isEnabled()) return respond({ error: 'Loyalty SMS delivery is not available yet.' }, 503)
  if (!(SMS_DELIVERY_ACTIONS as readonly string[]).includes(action)) return respond({ error: 'Not found' }, 404)
  const body = await readBody(request)
  const checks = { tenantId: isUuid, deviceId: isUuid, credential: isCredential }
  const lease = { jobId: isUuid, leaseToken: isUuid }
  const valid = action === 'claim' ? hasExactKeys(body, checks)
    : action === 'authorize' ? hasExactKeys(body, { ...checks, ...lease })
    : hasExactKeys(body, { ...checks, ...lease, outcome: isOutcome })
  if (!valid) return respond({ error: 'Malformed delivery request.' }, 400)
  const fields = body as Record<string, unknown>
  const tenantId = (fields.tenantId as string).toLowerCase()
  const auth = await authenticateMerchant(request, tenantId)
  if (!auth.ok) return auth.response
  if (!hasPermission(auth.member, 'loyalty_manage')) return respond({ error: 'Forbidden' }, 403)
  const credentialHash = hashDeviceCredential(fields.credential)
  if (!credentialHash) return respond({ error: 'Malformed delivery request.' }, 400)
  const identity = { tenantId, deviceId: (fields.deviceId as string).toLowerCase(), credentialHash }
  try {
    if (action === 'claim') return await claim(identity, auth.userId)
    const jobId = (fields.jobId as string).toLowerCase()
    const leaseToken = (fields.leaseToken as string).toLowerCase()
    if (action === 'authorize') return await authorize(identity, auth.userId, jobId, leaseToken)
    return await acknowledge(action as 'finish' | 'recover', identity, auth.userId, jobId, leaseToken, fields.outcome as Outcome)
  } catch {
    return unavailable(UNAVAILABLE)
  }
}

function rpcIdentity(identity: DeviceIdentity, actorId: string) {
  return {
    p_tenant_id: identity.tenantId, p_actor_id: actorId,
    p_device_id: identity.deviceId, p_credential_hash: identity.credentialHash,
  }
}

async function claim(identity: DeviceIdentity, actorId: string): Promise<NextResponse> {
  const { data, error }: RpcResult = await createAdminClient().rpc('claim_loyalty_sms_job', rpcIdentity(identity, actorId))
  if (error) return unavailable(UNAVAILABLE)
  if (isDenied(data)) return respond({ error: 'Forbidden' }, 403)
  if (!isRpcOk(data)) return respond({ job: null }, 200)
  const row = data as { jobId?: unknown; leaseToken?: unknown; leaseExpiresAt?: unknown }
  if (!isUuid(row.jobId) || !isUuid(row.leaseToken) ||
    typeof row.leaseExpiresAt !== 'string' || !Number.isFinite(Date.parse(row.leaseExpiresAt))) {
    return unavailable(UNAVAILABLE)
  }
  return respond({ job: { jobId: row.jobId, leaseToken: row.leaseToken, leaseExpiresAt: row.leaseExpiresAt } }, 200)
}

async function authorize(identity: DeviceIdentity, actorId: string, jobId: string, leaseToken: string): Promise<NextResponse> {
  const crypto = loadLoyaltyClaimCrypto()
  if (!crypto) return unavailable('Loyalty SMS delivery is not configured.')
  const grant = await authorizeLoyaltySmsDispatch(
    { ...identity, actorId, jobId, leaseToken },
    { crypto, database: createAdminClient(), now: () => Date.now() },
  )
  if (!grant.ok) return respond({ grant: null }, 200)
  const { jobId: id, leaseToken: token, phone, code, expiresAt } = grant
  return respond({ grant: { jobId: id, leaseToken: token, phone, code, expiresAt } }, 200)
}

async function acknowledge(
  action: 'finish' | 'recover', identity: DeviceIdentity, actorId: string,
  jobId: string, leaseToken: string, outcome: Outcome,
): Promise<NextResponse> {
  const name = action === 'finish' ? 'finish_loyalty_sms_job' : 'recover_loyalty_sms_ack'
  const { data, error }: RpcResult = await createAdminClient().rpc(name, {
    ...rpcIdentity(identity, actorId), p_job_id: jobId, p_lease_token: leaseToken, p_outcome: outcome,
  })
  if (error) return unavailable(UNAVAILABLE)
  if (typeof data === 'object' && data !== null && (data as { error?: unknown }).error === 'device_denied') {
    return respond({ error: 'Forbidden' }, 403)
  }
  return respond({ applied: isRpcOk(data) }, 200)
}
