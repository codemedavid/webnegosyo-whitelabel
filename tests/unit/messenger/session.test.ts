jest.mock('server-only', () => ({}))

const upserts: Array<{ row: Record<string, unknown>; onConflict: string }> = []
let replies: Array<{ data: unknown; error: unknown }> = []
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const query = {
        upsert: (row: Record<string, unknown>, options: { onConflict: string }) => { upserts.push({ row, onConflict: options.onConflict }); return query },
        select: () => query,
        single: async () => replies.shift(),
      }
      return query
    },
  }),
}))

import { touchSession } from '@/lib/messenger/session'

const input = { tenantId: 't1', pageId: 'page', psid: '24000000000000001', now: new Date('2026-11-10T00:00:00Z'), isInbound: true }

beforeEach(() => { upserts.length = 0; jest.spyOn(console, 'error').mockImplementation(() => {}) })

it('keys the session on (store, psid) and stamps the 24h window', async () => {
  replies = [{ data: { id: 's1', bot_paused_until: '2026-11-10T01:00:00Z' }, error: null }]
  expect(await touchSession(input)).toEqual({ id: 's1', botPausedUntil: new Date('2026-11-10T01:00:00Z'), firstName: null, profileFetchedAt: null })
  expect(upserts[0]).toMatchObject({ onConflict: 'tenant_id,psid', row: { page_id: 'page', last_inbound_at: '2026-11-10T00:00:00.000Z' } })
})

it('reads the stored Messenger profile with the session', async () => {
  replies = [{ data: { id: 's1', bot_paused_until: null, first_name: 'Juan', profile_fetched_at: '2026-11-01T00:00:00Z', cart_data: [] }, error: null }]
  expect(await touchSession(input)).toEqual({ id: 's1', botPausedUntil: null, firstName: 'Juan', profileFetchedAt: new Date('2026-11-01T00:00:00Z') })
})

it('before the migration (no new columns) it falls back to the old psid-keyed write', async () => {
  replies = [{ data: null, error: { code: '42703', message: 'column page_id does not exist' } }, { data: { id: 's-old', tenant_id: 't1' }, error: null }]
  expect(await touchSession(input)).toEqual({ id: 's-old', botPausedUntil: null, firstName: null, profileFetchedAt: null })
  expect(upserts[1]).toMatchObject({ onConflict: 'psid', row: { psid: input.psid, tenant_id: 't1', state: 'menu' } })
})

it('any other failure: no session (the reply still goes out, without a link token)', async () => {
  replies = [{ data: null, error: { code: '23505', message: 'duplicate' } }]
  expect(await touchSession(input)).toBeNull()
  expect(upserts).toHaveLength(1)
})
