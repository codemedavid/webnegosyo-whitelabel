/**
 * Queueing an owner test text (`queueTestText`). The claim RPC skips the guest
 * checks for test rows, so a number that asked the store to stop is refused
 * HERE, before any row exists.
 */
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

jest.mock('server-only', () => ({}))

const TENANT = '11111111-1111-4111-8111-111111111111'
const PHONE = '+639171234567'

async function load() {
  // next/jest leaves static imports ahead of jest.mock: import lazily.
  return import('@/lib/texts/server/test-text')
}

function tables(suppressed: string[]) {
  return {
    loyalty_sms_devices: [{ tenant_id: TENANT, device_id: 'd1', enabled: true }],
    sms_suppressions: suppressed.map(phone => ({ tenant_id: TENANT, phone_e164: phone })),
    sms_outbox: [],
    tenants: [{ id: TENANT, name: 'Demo' }],
  }
}

describe('queueTestText', () => {
  test('refuses a number that asked this store to stop texting it', async () => {
    const { queueTestText } = await load()
    const { client } = fakeSupabaseTables(tables([PHONE]))

    const result = await queueTestText(client as never, TENANT, PHONE)

    expect(result).toMatchObject({ ok: false, status: 409, code: 'suppressed' })
  })

  test('a stop from another store does not block this one', async () => {
    const { queueTestText } = await load()
    const db = fakeSupabaseTables({ ...tables([]), sms_suppressions: [{ tenant_id: 'other', phone_e164: PHONE }] })

    // The fake cannot insert, so getting past the check ends in a throw further on.
    const outcome = await queueTestText(db.client as never, TENANT, PHONE).catch(() => ({ code: 'went past the check' }))

    expect(outcome).not.toMatchObject({ code: 'suppressed' })
    expect(db.seen).toContain('sms_outbox')
  })
})
