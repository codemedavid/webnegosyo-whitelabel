jest.mock('server-only', () => ({}))

const updates: Array<{ table: string; row: Record<string, unknown>; filters: string[] }> = []
const upserts: Array<{ table: string; rows: unknown; options: unknown }> = []
let upsertError: { code: string; message: string } | null = null
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      upsert: async (rows: unknown, options: unknown) => { upserts.push({ table, rows, options }); return { error: upsertError } },
      update: (row: Record<string, unknown>) => {
        const entry = { table, row, filters: [] as string[] }
        updates.push(entry)
        const query = {
          eq: (column: string, value: string) => { entry.filters.push(`${column}=${value}`); return query },
          or: (filter: string) => { entry.filters.push(`or:${filter}`); return query },
          then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
        }
        return query
      },
    }),
  }),
}))

import { botLine, chatPreview, clipText, customerLine, needsProfile, staffLine } from '@/lib/messenger/chat-log'
import { refreshCustomerProfile, writeChatLog } from '@/lib/messenger/chat-log-store'
import { parseWebhookBody } from '@/lib/messenger/events'

const NOW = new Date('2026-11-12T03:00:00Z')
const base = { pageId: 'page', psid: 'psid', timestamp: Date.parse('2026-11-12T02:59:00Z'), dedupeKey: 'mid:m.1' }

beforeEach(() => {
  updates.length = 0
  upserts.length = 0
  upsertError = null
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('chat lines', () => {
  it('customer text keeps the words, Meta mid and time', () => {
    expect(customerLine({ ...base, kind: 'text', text: '  magkano po?  ' }, NOW)).toEqual({
      direction: 'in', kind: 'text', body: 'magkano po?', mid: 'm.1', sentAt: new Date(base.timestamp),
    })
  })

  it('taps show the button title; attachments a label, never media', () => {
    expect(customerLine({ ...base, kind: 'postback', payload: 'wn1|start', title: 'Get Started' }, NOW)?.body).toBe('Get Started')
    expect(customerLine({ ...base, kind: 'postback', payload: 'x', title: '' }, NOW)?.body).toBe('Tapped a button')
    expect(customerLine({ ...base, kind: 'other', attachment: 'photo' }, NOW)).toMatchObject({ kind: 'photo', body: '📷 Photo' })
    expect(customerLine({ ...base, kind: 'other', attachment: 'sticker' }, NOW)).toMatchObject({ kind: 'sticker', body: '👍 Sticker' })
    expect(customerLine({ ...base, kind: 'other', attachment: 'audio' }, NOW)).toMatchObject({ kind: 'other', body: '🎤 Voice message' })
  })

  it('an empty text or an echo is not a customer line; no Meta timestamp = now', () => {
    expect(customerLine({ ...base, kind: 'text', text: '   ' }, NOW)).toBeNull()
    expect(customerLine({ ...base, kind: 'echo', text: 'x', appId: null, metadata: null }, NOW)).toBeNull()
    expect(customerLine({ ...base, timestamp: 0, kind: 'text', text: 'hi' }, NOW)?.sentAt).toEqual(NOW)
    expect(customerLine({ ...base, dedupeKey: 'msg:psid:1', kind: 'text', text: 'hi' }, NOW)?.mid).toBeNull()
  })

  it('staff lines carry what was typed', () => {
    expect(staffLine({ ...base, kind: 'echo', text: 'Ready na po', appId: null, metadata: null }, NOW)).toMatchObject({ direction: 'staff', kind: 'text', body: 'Ready na po' })
    expect(staffLine({ ...base, kind: 'echo', text: '', appId: null, metadata: null }, NOW)).toMatchObject({ kind: 'other', body: '📎 Attachment' })
  })

  it('a bot reply is one line: texts as sent, cards as their titles, no links', () => {
    const line = botLine([
      { kind: 'text', text: '✅ Added Sisig' },
      { kind: 'cards', cards: ['A', 'B', 'C', 'D'].map((title) => ({ title, buttons: [{ type: 'web_url' as const, url: 'https://x.test/menu?m=TOKEN', title: 'Order' }] })) },
    ], NOW)
    expect(line).toMatchObject({ direction: 'bot', kind: 'card', mid: null, body: '✅ Added Sisig\n🗂 Sent 4 cards: A, B, C…' })
    expect(line?.body).not.toContain('TOKEN')
    expect(botLine([], NOW)).toBeNull()
  })

  it('lines are clipped to 1,000 characters and previews to 120, by code point', () => {
    const long = '😀'.repeat(1200)
    const line = customerLine({ ...base, kind: 'text', text: long }, NOW)
    expect(Array.from(line?.body ?? '')).toHaveLength(1000)
    expect(line?.body.endsWith('…')).toBe(true)
    expect(Array.from(chatPreview({ body: `a\n\n${'b'.repeat(200)}` }))).toHaveLength(120)
    expect(chatPreview({ body: 'line one\nline two' })).toBe('line one line two')
    expect(clipText('short', 10)).toBe('short')
  })

  it('a profile is fetched when never asked, monthly when named, daily after a miss', () => {
    const day = 86_400_000
    expect(needsProfile({ firstName: null, profileFetchedAt: null }, NOW)).toBe(true)
    expect(needsProfile({ firstName: 'Ana', profileFetchedAt: new Date(NOW.getTime() - 29 * day) }, NOW)).toBe(false)
    expect(needsProfile({ firstName: 'Ana', profileFetchedAt: new Date(NOW.getTime() - 30 * day) }, NOW)).toBe(true)
    expect(needsProfile({ firstName: null, profileFetchedAt: new Date(NOW.getTime() - day + 1) }, NOW)).toBe(false)
    expect(needsProfile({ firstName: null, profileFetchedAt: new Date(NOW.getTime() - day) }, NOW)).toBe(true)
  })
})

describe('webhook attachments', () => {
  const body = (message: Record<string, unknown>) => ({
    object: 'page',
    entry: [{ id: 'page', messaging: [{ sender: { id: 'psid' }, recipient: { id: 'page' }, timestamp: 1, message: { mid: 'm.9', ...message } }] }],
  })
  it.each([
    [[{ type: 'image', payload: { url: 'https://x' } }], 'photo'],
    [[{ type: 'image', payload: { url: 'https://x', sticker_id: 369239263222822 } }], 'sticker'],
    [[{ type: 'audio', payload: {} }], 'audio'],
    [[{ type: 'fallback' }], 'other'],
    [undefined, 'other'],
  ])('%j → %s', (attachments, kind) => {
    expect(parseWebhookBody(body({ attachments }))).toEqual([expect.objectContaining({ kind: 'other', attachment: kind })])
  })
})

describe('writeChatLog', () => {
  const lines = [
    { direction: 'in' as const, kind: 'text' as const, body: 'menu', mid: 'm.1', sentAt: new Date('2026-11-12T02:00:00Z') },
    { direction: 'bot' as const, kind: 'card' as const, body: '🗂 Sent: Our menu', mid: null, sentAt: new Date('2026-11-12T02:00:01Z') },
  ]

  it('one insert per event, retried lines skipped by mid, then the newest line as the preview', async () => {
    await writeChatLog({ tenantId: 't1', sessionId: 's1', lines })
    expect(upserts).toHaveLength(1)
    expect(upserts[0]).toMatchObject({ table: 'messenger_messages', options: { onConflict: 'mid', ignoreDuplicates: true } })
    expect((upserts[0].rows as unknown[])[1]).toEqual({ tenant_id: 't1', session_id: 's1', direction: 'bot', kind: 'card', body: '🗂 Sent: Our menu', mid: null, sent_at: '2026-11-12T02:00:01.000Z' })
    expect(updates).toEqual([{
      table: 'messenger_sessions',
      row: { last_message_at: '2026-11-12T02:00:01.000Z', last_message_preview: '🗂 Sent: Our menu' },
      filters: ['id=s1', 'or:last_message_at.is.null,last_message_at.lte."2026-11-12T02:00:01.000Z"'],
    }])
  })

  it('a failed insert leaves the preview alone and never throws', async () => {
    upsertError = { code: '23503', message: 'fk' }
    await expect(writeChatLog({ tenantId: 't1', sessionId: 's1', lines })).resolves.toBeUndefined()
    expect(updates).toEqual([])
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('nothing to log = no query', async () => {
    await writeChatLog({ tenantId: 't1', sessionId: 's1', lines: [] })
    expect(upserts).toEqual([])
  })
})

describe('refreshCustomerProfile', () => {
  // jsdom has no Response: the two methods the fetch path reads.
  const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) })
  const input = { sessionId: 's1', token: 'page-token', psid: '2400', now: NOW }

  it('stores name + https photo and returns the first name', async () => {
    const fetchImpl = jest.fn(async () => reply({ first_name: ' Juan ', last_name: 'Dela  Cruz', profile_pic: 'https://lookaside.test/p.jpg', id: '2400' }))
    expect(await refreshCustomerProfile(input, fetchImpl as unknown as typeof fetch)).toBe('Juan')
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain('/2400?fields=first_name,last_name,profile_pic&access_token=page-token')
    expect(updates[0]).toEqual({
      table: 'messenger_sessions',
      row: { first_name: 'Juan', last_name: 'Dela Cruz', profile_pic_url: 'https://lookaside.test/p.jpg', profile_fetched_at: NOW.toISOString() },
      filters: ['id=s1'],
    })
  })

  it('a refusal stores only the attempt (keeps any old name) and logs Meta code, never the PSID', async () => {
    const fetchImpl = jest.fn(async () => reply({ error: { code: 230, message: 'Requires pages_messaging permission' } }, 400))
    expect(await refreshCustomerProfile(input, fetchImpl as unknown as typeof fetch)).toBeNull()
    expect(updates[0].row).toEqual({ profile_fetched_at: NOW.toISOString() })
    expect(JSON.stringify((console.error as jest.Mock).mock.calls)).toContain('230')
    expect(JSON.stringify((console.error as jest.Mock).mock.calls)).not.toContain('2400')
  })

  it('a network error or a non-https photo never throws and never stores the bad photo', async () => {
    const down = jest.fn(async () => { throw new Error('timeout') })
    expect(await refreshCustomerProfile(input, down as unknown as typeof fetch)).toBeNull()
    const http = jest.fn(async () => reply({ first_name: 'Ana', profile_pic: 'http://x/p.jpg' }))
    await refreshCustomerProfile(input, http as unknown as typeof fetch)
    expect(updates[1].row).toMatchObject({ first_name: 'Ana', profile_pic_url: null })
  })
})
