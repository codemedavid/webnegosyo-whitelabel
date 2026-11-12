/** @jest-environment node */
/**
 * LIVE check of the customer app's loyalty routes against the real PLATFORM
 * database, on sample-demo (the designated test store: platform backend,
 * loyalty live, one active program). Owner OK'd on 2026-11-12:
 *
 *   1. a throwaway `+63999…` app customer + session (real token helpers);
 *   2. ONE balance correction through the merchant's own writer
 *      (`adjustMemberBalance` → `apply_loyalty_earning`), sized to the card's
 *      threshold so a reward unlocks — the ledger is append-only, so this row
 *      stays, noted `live-test`;
 *   3. GET /api/app/v1/me/loyalty exactly as the app calls it: balance,
 *      reward, history, and a member code that the POS identify path
 *      (`identifyMemberBySerial`) resolves back to this customer;
 *   4. POST /me/loyalty/claims → a claim row bound to the session (never
 *      redeemed; it expires in 2 minutes);
 *   5. cleanup: the reward is VOIDED (`resolve_loyalty_entitlement`, so a real
 *      owner of the number can never use it), the run's member-card row and
 *      the app account deleted.
 *
 *   CUSTOMER_APP_LOYALTY_LIVE=1 npx jest tests/live/customer-app-loyalty-live.test.ts
 *
 * The claim token is signed with a throwaway key generated for this run (the
 * deploy's LOYALTY_* keys are not in .env.local); the database only ever sees
 * its hash, exactly as in production. That the register accepts an app claim
 * is proven in tests/sql/run-customer-app-loyalty.cjs against the real SQL.
 */
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import fs from 'fs'
import path from 'path'
import type { NextRequest as NextRequestType } from 'next/server'

const isLive = process.env.CUSTOMER_APP_LOYALTY_LIVE === '1'
const TENANT_SLUG = 'sample-demo'
const DEV_APP_ID = 'com.webnegosyo.customer.dev'
const TEST_NOTE = 'live-test: customer app loyalty check (2026-11-12 P5)'
/** TEST-NET-3: never a real customer's address. */
const TEST_IP = '203.0.113.78'

function loadEnv(): void {
  const candidates = [path.join(process.cwd(), '.env.local'), path.join(process.cwd(), '../../../.env.local')]
  const file = candidates.find((candidate) => fs.existsSync(candidate))
  if (!file) throw new Error('No .env.local found for the live run')
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  process.env.APP_DEV_TENANT_SLUG = TENANT_SLUG
  // Throwaway signing keys for this run only (see the header).
  process.env.LOYALTY_HASH_KEY = randomBytes(32).toString('base64')
  process.env.LOYALTY_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  process.env.LOYALTY_PUBLIC_CLAIMS_ENABLED = 'true'
  process.env.LOYALTY_POS_SETTLEMENT_ENABLED = 'true'
  delete process.env.VERCEL_ENV
}

if (isLive) loadEnv()

jest.mock('server-only', () => ({}))
jest.mock('@supabase/ssr', () => jest.requireActual('@supabase/ssr'))
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))
jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }))
jest.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }),
  headers: async () => new Headers(),
}))

const liveDescribe = isLive ? describe : describe.skip

interface Envelope {
  success: boolean
  data: Record<string, unknown> | null
  error: { code: string; message: string } | null
}

const admin = async () => (await import('@/lib/supabase/admin')).createAdminClient()
const fakePhone = () => `+63999${String(randomInt(0, 10_000_000)).padStart(7, '0')}`

async function appRequest(pathname: string, token: string, init: { method?: string; body?: unknown } = {}): Promise<NextRequestType> {
  const { NextRequest } = await import('next/server')
  return new NextRequest(`http://localhost${pathname}`, {
    method: init.method ?? 'GET',
    headers: {
      'x-app-id': DEV_APP_ID,
      authorization: `Bearer ${token}`,
      'x-forwarded-for': TEST_IP,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

liveDescribe('customer app loyalty — live on sample-demo (platform)', () => {
  jest.setTimeout(90_000)

  let tenantId = ''
  let programId = ''
  let threshold = 0
  let customerId = ''
  let customerKey = ''
  let token = ''
  const issuedRewards: string[] = []

  beforeAll(async () => {
    const db = await admin()
    const { data: tenant, error } = await db.from('tenants').select('id, loyalty_enabled, loyalty_shadow').eq('slug', TENANT_SLUG).single()
    if (error || !tenant) throw new Error(`store read failed: ${error?.message}`)
    const row = tenant as { id: string; loyalty_enabled: boolean; loyalty_shadow: boolean }
    if (!row.loyalty_enabled || row.loyalty_shadow) throw new Error('sample-demo loyalty is not live')
    tenantId = row.id

    const { data: programs, error: programError } = await db
      .from('loyalty_programs')
      .select('id, current_version_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('created_at')
      .limit(1)
    if (programError || !programs?.length) throw new Error(`program read failed: ${programError?.message}`)
    const program = programs[0] as { id: string; current_version_id: string }
    programId = program.id
    const version = await db.from('loyalty_program_versions').select('rules').eq('id', program.current_version_id).single()
    if (version.error) throw new Error(`version read failed: ${version.error.message}`)
    threshold = Number((version.data as { rules: { threshold: number } }).rules.threshold)
    if (!(threshold > 0)) throw new Error('no threshold on the active program')

    // The throwaway app customer, with a session minted by the real helpers.
    const { createAppSessionToken } = await import('@/lib/customer-auth/session-token')
    const phone = fakePhone()
    customerKey = `phone:${phone}`
    const { data: customer, error: customerError } = await db
      .from('customers')
      .insert({ tenant_id: tenantId, phone_e164: phone, created_source: 'app', name: 'TEST loyalty app' })
      .select('id')
      .single()
    if (customerError || !customer) throw new Error(`customer insert failed: ${customerError?.message}`)
    customerId = (customer as { id: string }).id
    const profile = await db.from('customer_app_profiles').insert({ customer_id: customerId, tenant_id: tenantId, display_name: 'TEST loyalty app' })
    if (profile.error) throw new Error(`profile insert failed: ${profile.error.message}`)
    const session = createAppSessionToken()
    token = session.token
    const now = Date.now()
    const inserted = await db.from('customer_app_sessions').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      phone_hash: createHash('sha256').update(`live-test:${phone}`).digest('hex'),
      token_hash: session.tokenHash,
      expires_at: new Date(now + 86_400_000).toISOString(),
      absolute_expires_at: new Date(now + 2 * 86_400_000).toISOString(),
    })
    if (inserted.error) throw new Error(`session insert failed: ${inserted.error.message}`)
  })

  afterAll(async () => {
    const db = await admin()
    // A reward for a number nobody here owns must never be usable: void it (append-only).
    for (const rewardId of issuedRewards) {
      const { error } = await db.rpc('resolve_loyalty_entitlement', {
        p_tenant_id: tenantId, p_entitlement_id: rewardId, p_action: 'void', p_note: TEST_NOTE,
        // No staff actor in a test; the column is nullable (the type says string).
        p_actor: null as unknown as string,
      })
      if (error) console.error('[live] reward void failed — void it by hand', rewardId, error.message)
    }
    // The member card this run created (a throwaway number's pass row; nothing else refers to it).
    if (customerKey && programId) {
      const { error } = await db.from('loyalty_wallet_passes').delete().eq('tenant_id', tenantId).eq('program_id', programId).eq('customer_key', customerKey)
      if (error) console.error('[live] pass cleanup failed', error.message)
    }
    if (customerId) {
      const { error } = await db.rpc('delete_customer_app_account', { p_tenant_id: tenantId, p_customer_id: customerId })
      if (error) console.error('[live] account delete failed', customerId, error.message)
    }
  })

  it('a new member sees an empty card with a member code the register can identify', async () => {
    const { GET } = await import('@/app/api/app/v1/me/loyalty/route')
    const response = await GET(await appRequest('/api/app/v1/me/loyalty', token))
    const body = (await response.json()) as Envelope
    expect(response.status).toBe(200)
    const { appLoyaltySchema } = await import('@/lib/app-contract')
    const loyalty = appLoyaltySchema.parse(body.data)
    expect(loyalty.programs.find((program) => program.id === programId)?.balance).toBe(0)
    expect(loyalty.rewards).toEqual([])
    expect(loyalty.memberCode).toMatch(/^WNLC1\./)

    // The POS path: the scanned code resolves to exactly this customer.
    const { parseMemberCode } = await import('@/lib/loyalty/wallet-pass/member-code')
    const { identifyMemberBySerial } = await import('@/lib/loyalty/wallet-pass/pass-service')
    const member = await identifyMemberBySerial(await admin(), tenantId, parseMemberCode(loyalty.memberCode) as string)
    expect(member).toEqual({ phoneE164: customerKey.slice('phone:'.length), programId })

    // A second read reuses the same pass row (no second serial).
    const again = appLoyaltySchema.parse(((await (await GET(await appRequest('/api/app/v1/me/loyalty', token))).json()) as Envelope).data)
    expect(again.memberCode).toBe(loyalty.memberCode)
  })

  it('one correction to the threshold unlocks a reward the app shows, with its history', async () => {
    const db = await admin()
    const { adjustMemberBalance } = await import('@/lib/loyalty/member-management')
    const outcome = await adjustMemberBalance(db, tenantId, {
      programId, customerKey, delta: threshold, note: TEST_NOTE, requestId: randomUUID(),
    }, null)
    expect(outcome).toEqual(expect.objectContaining({ applied: true, rewardsIssued: 1 }))

    const { GET } = await import('@/app/api/app/v1/me/loyalty/route')
    const { appLoyaltySchema } = await import('@/lib/app-contract')
    const loyalty = appLoyaltySchema.parse(((await (await GET(await appRequest('/api/app/v1/me/loyalty', token))).json()) as Envelope).data)
    expect(loyalty.rewards).toHaveLength(1)
    issuedRewards.push(loyalty.rewards[0].id)
    expect(loyalty.activity.map((event) => event.kind)).toEqual(expect.arrayContaining(['correction', 'reward_issued']))
    expect(loyalty.claimsAvailable).toBe(true)
  })

  it('"Use now" mints a 2-minute claim bound to the session, stored as a hash only', async () => {
    const { POST } = await import('@/app/api/app/v1/me/loyalty/claims/route')
    const response = await POST(await appRequest('/api/app/v1/me/loyalty/claims', token, { method: 'POST', body: { rewardId: issuedRewards[0] } }))
    const body = (await response.json()) as Envelope
    expect(response.status).toBe(201)
    const { appRewardClaimSchema } = await import('@/lib/app-contract')
    const claim = appRewardClaimSchema.parse(body.data)
    const left = Date.parse(claim.expiresAt) - Date.now()
    expect(left).toBeGreaterThan(60_000)
    // Two minutes from the DATABASE clock; allow a few seconds of skew against this machine.
    expect(left).toBeLessThanOrEqual(125_000)

    const db = await admin()
    const { data, error } = await db
      .from('loyalty_verified_claims')
      .select('entitlement_id, challenge_id, app_session_id, used_at, token_hash, created_at, expires_at')
      .eq('tenant_id', tenantId)
      .eq('entitlement_id', issuedRewards[0])
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    const row = (data ?? [])[0] as { challenge_id: string | null; app_session_id: string | null; used_at: string | null; token_hash: string }
    expect(row.challenge_id).toBeNull()
    expect(row.app_session_id).not.toBeNull()
    expect(row.used_at).toBeNull()
    expect(row.token_hash).not.toBe(claim.token)
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/)
    const stored = row as unknown as { created_at: string; expires_at: string }
    expect(Date.parse(stored.expires_at) - Date.parse(stored.created_at)).toBe(120_000)

    // Another customer's session cannot claim it: the database answers the generic refusal.
    const stranger = await POST(await appRequest('/api/app/v1/me/loyalty/claims', `cs1.${'A'.repeat(43)}`, { method: 'POST', body: { rewardId: issuedRewards[0] } }))
    expect(stranger.status).toBe(401)
  })
})
