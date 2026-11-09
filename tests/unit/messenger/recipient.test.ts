jest.mock('server-only', () => ({}))

const readSessionOwner = jest.fn()
jest.mock('@/lib/messenger/session', () => ({ readSessionOwner: (id: string) => readSessionOwner(id) }))
const legacyRow = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => legacyRow() }
    return { from: () => query }
  },
}))

import { createMessengerLinkToken } from '@/lib/messenger/link-token'
import { LEGACY_PSID_ACCEPTED_UNTIL, resolveMessengerRecipient, withVerifiedMessengerPsid } from '@/lib/messenger/recipient'

const SESSION = '0b0c9d3c-1111-4000-8000-000000000001'
const NOW = new Date('2026-11-10T00:00:00Z')

describe('resolveMessengerRecipient', () => {
  const env = process.env
  beforeEach(() => {
    process.env = { ...env, API_SECRET: 'secret' }
    readSessionOwner.mockReset()
    legacyRow.mockReset()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterAll(() => { process.env = env })

  it('a token for this store → its PSID', async () => {
    readSessionOwner.mockResolvedValue({ tenantId: 't1', psid: '24000000000000001' })
    const token = createMessengerLinkToken(SESSION, NOW)
    expect(await resolveMessengerRecipient('t1', token, NOW)).toBe('24000000000000001')
  })

  it("another store's token → nothing", async () => {
    readSessionOwner.mockResolvedValue({ tenantId: 't2', psid: '24000000000000001' })
    expect(await resolveMessengerRecipient('t1', createMessengerLinkToken(SESSION, NOW), NOW)).toBeNull()
  })

  it('a forged token never reaches the database', async () => {
    const token = (createMessengerLinkToken(SESSION, NOW) as string).replace(/.$/, 'A')
    expect(await resolveMessengerRecipient('t1', token, NOW)).toBeNull()
    expect(readSessionOwner).not.toHaveBeenCalled()
  })

  it('a legacy raw PSID only with an existing session, only until the cut-off', async () => {
    legacyRow.mockResolvedValue({ data: { id: 's' }, error: null })
    expect(await resolveMessengerRecipient('t1', '24000000000000001', NOW)).toBe('24000000000000001')
    legacyRow.mockResolvedValue({ data: null, error: null })
    expect(await resolveMessengerRecipient('t1', '24000000000000002', NOW)).toBeNull()
    legacyRow.mockResolvedValue({ data: { id: 's' }, error: null })
    expect(await resolveMessengerRecipient('t1', '24000000000000001', LEGACY_PSID_ACCEPTED_UNTIL)).toBeNull()
  })

  it('anything else → nothing', async () => {
    for (const value of [undefined, null, 42, '', 'not a psid', '<script>']) {
      expect(await resolveMessengerRecipient('t1', value, NOW)).toBeNull()
    }
    expect(legacyRow).not.toHaveBeenCalled()
  })
})

describe('withVerifiedMessengerPsid', () => {
  beforeEach(() => { process.env.API_SECRET = 'secret'; legacyRow.mockResolvedValue({ data: null, error: null }) })

  it('drops a reference that does not resolve, keeps everything else', async () => {
    expect(await withVerifiedMessengerPsid('t1', { name: 'Ana', messenger_psid: '24000000000000009' })).toEqual({ name: 'Ana' })
  })

  it('leaves customer data without a reference untouched (no lookup)', async () => {
    const data = { name: 'Ana' }
    expect(await withVerifiedMessengerPsid('t1', data)).toBe(data)
    expect(await withVerifiedMessengerPsid('t1', undefined)).toBeUndefined()
  })
})
