/** @jest-environment node */
/**
 * /api/app/v1/me/loyalty and /me/loyalty/claims — the signed-in customer's
 * card and the "Use now" claim QR. The RPCs are mocked at the Supabase client;
 * their SQL is proven by tests/sql/run-customer-app-loyalty.cjs.
 */
import { NextRequest } from 'next/server'
import { appEnvelopeSchema, appLoyaltySchema, appRewardClaimSchema } from '@/lib/app-contract'

jest.mock('server-only', () => ({}))
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

const TENANT = '00000000-0000-4000-8000-000000000001'
const REWARD = '6f1c2a40-5b7e-4c1d-9a3e-2b8f0d4e6a11'
const PROGRAM = '7a1c2a40-5b7e-4c1d-9a3e-2b8f0d4e6a22'
const KEY = 'phone:+639171234567'

const getTenantApp = jest.fn()
jest.mock('@/lib/app-api/tenant-app', () => ({ getTenantApp: (...a: unknown[]) => getTenantApp(...a) }))
const checkRateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }))
const resolveCustomerSession = jest.fn()
jest.mock('@/lib/customer-auth/account', () => ({ resolveCustomerSession: (...a: unknown[]) => resolveCustomerSession(...a) }))

const rpc = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ ADMIN_QUERY_TIMEOUT_MS: 8000, createAdminClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }))
const readLoyaltyActivity = jest.fn()
jest.mock('@/lib/loyalty/activity-repository', () => ({ readLoyaltyActivity: (...a: unknown[]) => readLoyaltyActivity(...a) }))
const ensurePass = jest.fn()
jest.mock('@/lib/loyalty/wallet-pass/pass-repository', () => ({ ensurePass: (...a: unknown[]) => ensurePass(...a) }))
const createClaim = jest.fn()
const loadLoyaltyClaimCrypto = jest.fn()
jest.mock('@/lib/loyalty/server-keys', () => ({ loadLoyaltyClaimCrypto: () => loadLoyaltyClaimCrypto() }))

const RELEASE = { minimumVersion: null, latestVersion: null, storeUrl: null }
const APP = { tenantId: TENANT, slug: 'sample-demo', status: 'live', ios: RELEASE, android: RELEASE }
const TOKEN_HASH = 'a'.repeat(64)
const CLAIM_TOKEN = `v1.${'B'.repeat(43)}.${'c'.repeat(64)}`

const RULES = { earnMode: 'stamp', threshold: 8, reward: { type: 'free_item', menuItemId: '8b1c2a40-5b7e-4c1d-9a3e-2b8f0d4e6a33', itemName: 'Iced Tea' } }
const WALLET = {
  ok: true,
  live: true,
  customerKey: KEY,
  programs: [{ id: PROGRAM, name: 'Kape Card', status: 'active', scope: 'business', branchName: null, rules: RULES, balance: 3 }],
  rewards: [{ id: REWARD, terms: { programName: 'Kape Card', reward: RULES.reward }, expiresAt: '2026-12-01T00:00:00+00:00', scope: 'business', branchName: null }],
}

function request(path: string, init: { method?: string; body?: unknown; signedIn?: boolean } = {}) {
  const headers: Record<string, string> = { 'x-app-id': 'com.webnegosyo.sample' }
  if (init.signedIn !== false) headers.authorization = `Bearer cs1.${'A'.repeat(43)}`
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  return new NextRequest(`http://localhost${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
}

const routes = async () => ({
  getLoyalty: (await import('@/app/api/app/v1/me/loyalty/route')).GET,
  claim: (await import('@/app/api/app/v1/me/loyalty/claims/route')).POST,
})

const ENV = { ...process.env }

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ENV, LOYALTY_PUBLIC_CLAIMS_ENABLED: 'true', LOYALTY_POS_SETTLEMENT_ENABLED: 'true' }
  getTenantApp.mockResolvedValue({ app: APP, error: null })
  checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })
  resolveCustomerSession.mockResolvedValue({ customerId: 'cust-1', tokenHash: TOKEN_HASH })
  rpc.mockImplementation(async (name: string) => {
    if (name === 'app_customer_loyalty') return { data: WALLET, error: null }
    if (name === 'issue_app_loyalty_claim') return { data: { ok: true, expiresAt: '2026-11-12T10:02:00+00:00' }, error: null }
    return { data: null, error: { message: `unexpected ${name}` } }
  })
  readLoyaltyActivity.mockResolvedValue({
    events: [
      { id: 'e1', kind: 'earn', occurredAt: '2026-11-10T02:00:00Z', programName: 'Kape Card', delta: 1, rewardLabel: null },
      { id: 'e2', kind: 'reward_reserved', occurredAt: '2026-11-10T03:00:00Z', programName: 'Kape Card', delta: null, rewardLabel: 'Free Iced Tea' },
    ],
    nextCursor: null,
  })
  ensurePass.mockResolvedValue({ serial_number: 'S'.repeat(24) })
  createClaim.mockReturnValue({ token: CLAIM_TOKEN, tokenHash: 'd'.repeat(64) })
  loadLoyaltyClaimCrypto.mockReturnValue({ createClaim })
})

afterAll(() => { process.env = ENV })

describe('GET /api/app/v1/me/loyalty', () => {
  it('answers the card from the session-bound RPC, with the member code and history', async () => {
    const { getLoyalty } = await routes()
    const response = await getLoyalty(request('/api/app/v1/me/loyalty'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const parsed = appEnvelopeSchema(appLoyaltySchema).parse(await response.json())
    if (!parsed.success) throw new Error('envelope')
    expect(parsed.data.memberCode).toBe(`WNLC1.${'S'.repeat(24)}`)
    expect(parsed.data.programs).toEqual([expect.objectContaining({ id: PROGRAM, balance: 3, threshold: 8, earnMode: 'stamp' })])
    expect(parsed.data.rewards).toEqual([expect.objectContaining({ id: REWARD, programName: 'Kape Card' })])
    expect(parsed.data.activity.map((event) => event.kind)).toEqual(['earn'])
    expect(parsed.data.claimsAvailable).toBe(true)

    expect(rpc).toHaveBeenCalledWith('app_customer_loyalty', { p_tenant_id: TENANT, p_session_token_hash: TOKEN_HASH })
    expect(ensurePass).toHaveBeenCalledWith(expect.anything(), { tenantId: TENANT, programId: PROGRAM, customerKey: KEY }, expect.any(Function))
    expect(readLoyaltyActivity).toHaveBeenCalledWith(expect.anything(), TENANT, { limit: 30, customerKey: KEY })
  })

  it('is 401 when signed out, and when the RPC no longer finds the session', async () => {
    const { getLoyalty } = await routes()
    resolveCustomerSession.mockResolvedValueOnce(null)
    expect((await getLoyalty(request('/api/app/v1/me/loyalty', { signedIn: false }))).status).toBe(401)

    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'signed_out' }, error: null })
    expect((await getLoyalty(request('/api/app/v1/me/loyalty'))).status).toBe(401)
  })

  it('answers an empty card (no member code, no write) when loyalty is off', async () => {
    const { getLoyalty } = await routes()
    rpc.mockResolvedValueOnce({ data: { ok: true, live: false, customerKey: KEY, programs: [], rewards: [] }, error: null })
    const parsed = appEnvelopeSchema(appLoyaltySchema).parse(await (await getLoyalty(request('/api/app/v1/me/loyalty'))).json())
    expect(parsed.success && parsed.data).toEqual({ memberCode: null, programs: [], rewards: [], activity: [], claimsAvailable: false })
    expect(ensurePass).not.toHaveBeenCalled()
  })

  it('issues no member code without an active program', async () => {
    const { getLoyalty } = await routes()
    rpc.mockResolvedValueOnce({ data: { ...WALLET, programs: [{ ...WALLET.programs[0], status: 'ended' }] }, error: null })
    const parsed = appEnvelopeSchema(appLoyaltySchema).parse(await (await getLoyalty(request('/api/app/v1/me/loyalty'))).json())
    expect(parsed.success && parsed.data.memberCode).toBeNull()
    expect(ensurePass).not.toHaveBeenCalled()
  })

  it('still answers the card when the history is unreadable', async () => {
    const { getLoyalty } = await routes()
    readLoyaltyActivity.mockRejectedValueOnce(new Error('boom'))
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const response = await getLoyalty(request('/api/app/v1/me/loyalty'))
    expect(response.status).toBe(200)
  })

  it('says claims are off when the counter cannot redeem them', async () => {
    const { getLoyalty } = await routes()
    process.env.LOYALTY_POS_SETTLEMENT_ENABLED = 'false'
    const parsed = appEnvelopeSchema(appLoyaltySchema).parse(await (await getLoyalty(request('/api/app/v1/me/loyalty'))).json())
    expect(parsed.success && parsed.data.claimsAvailable).toBe(false)
  })
})

describe('POST /api/app/v1/me/loyalty/claims', () => {
  it('mints a claim QR bound to the session; only its hash reaches the database', async () => {
    const { claim } = await routes()
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    const response = await claim(request('/api/app/v1/me/loyalty/claims', { method: 'POST', body: { rewardId: REWARD.toUpperCase() } }))

    expect(response.status).toBe(201)
    const parsed = appEnvelopeSchema(appRewardClaimSchema).parse(await response.json())
    expect(parsed.success && parsed.data).toEqual({ token: CLAIM_TOKEN, expiresAt: '2026-11-12T10:02:00.000Z' })
    expect(rpc).toHaveBeenCalledWith('issue_app_loyalty_claim', {
      p_tenant_id: TENANT, p_session_token_hash: TOKEN_HASH, p_entitlement_id: REWARD, p_claim_token_hash: 'd'.repeat(64),
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(CLAIM_TOKEN)
    expect(JSON.stringify(log.mock.calls)).not.toContain(CLAIM_TOKEN)
  })

  it('answers every database refusal with one generic message', async () => {
    const { claim } = await routes()
    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'unavailable' }, error: null })
    const response = await claim(request('/api/app/v1/me/loyalty/claims', { method: 'POST', body: { rewardId: REWARD } }))
    expect(response.status).toBe(422)
    expect((await response.json()).error.code).toBe('refused')
  })

  it('passes the database budget through as 429', async () => {
    const { claim } = await routes()
    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'rate_limited' }, error: null })
    const response = await claim(request('/api/app/v1/me/loyalty/claims', { method: 'POST', body: { rewardId: REWARD } }))
    expect(response.status).toBe(429)
  })

  it('refuses without touching the database when claims are off or the keys are missing', async () => {
    const { claim } = await routes()
    process.env.LOYALTY_PUBLIC_CLAIMS_ENABLED = 'false'
    expect((await claim(request('/api/app/v1/me/loyalty/claims', { method: 'POST', body: { rewardId: REWARD } }))).status).toBe(422)
    process.env.LOYALTY_PUBLIC_CLAIMS_ENABLED = 'true'
    loadLoyaltyClaimCrypto.mockReturnValue(null)
    expect((await claim(request('/api/app/v1/me/loyalty/claims', { method: 'POST', body: { rewardId: REWARD } }))).status).toBe(422)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('is 400 for a malformed body and 401 signed out', async () => {
    const { claim } = await routes()
    expect((await claim(request('/api/app/v1/me/loyalty/claims', { method: 'POST', body: { rewardId: 'nope' } }))).status).toBe(400)
    resolveCustomerSession.mockResolvedValueOnce(null)
    expect((await claim(request('/api/app/v1/me/loyalty/claims', { method: 'POST', body: { rewardId: REWARD }, signedIn: false }))).status).toBe(401)
  })
})
