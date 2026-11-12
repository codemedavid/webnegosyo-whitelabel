jest.mock('server-only', () => ({}))

import { parseWebhookBody } from '@/lib/messenger/events'
import { createMessengerLinkToken, readMessengerLinkToken, MESSENGER_LINK_TTL_SECONDS } from '@/lib/messenger/link-token'
import { looksLikeMessengerLinkToken } from '@/lib/messenger/link-token-shape'

const PAGE = '630525656821329'
const PSID = '24000000000000001'

function body(...messaging: unknown[]) {
  return { object: 'page', entry: [{ id: PAGE, time: 1, messaging }] }
}
const from = { sender: { id: PSID }, recipient: { id: PAGE } }

describe('parseWebhookBody', () => {
  it('is null for non-page objects', () => {
    expect(parseWebhookBody({ object: 'instagram', entry: [] })).toBeNull()
    expect(parseWebhookBody('nonsense')).toBeNull()
  })

  it('reads text, quick replies, postbacks, attachments', () => {
    const events = parseWebhookBody(body(
      { ...from, timestamp: 3, message: { mid: 'm3', text: 'Menu', quick_reply: { payload: 'wn1|menu' } } },
      { ...from, timestamp: 1, message: { mid: 'm1', text: 'hi' } },
      { ...from, timestamp: 2, postback: { mid: 'p2', title: 'Get Started', payload: 'wn1|start' } },
      { ...from, timestamp: 4, message: { mid: 'm4', attachments: [{ type: 'image' }] } },
    ))
    expect(events?.map((event) => [event.kind, event.dedupeKey])).toEqual([
      ['text', 'mid:m1'], ['postback', 'mid:p2'], ['quick_reply', 'mid:m3'], ['other', 'mid:m4'],
    ])
  })

  it('an echo belongs to the customer it was sent TO, with its app id', () => {
    const [echo] = parseWebhookBody(body({
      sender: { id: PAGE }, recipient: { id: PSID }, timestamp: 5,
      message: { mid: 'e1', is_echo: true, app_id: 263902037430900, text: 'Hello po!' },
    })) ?? []
    expect(echo).toMatchObject({ kind: 'echo', psid: PSID, appId: '263902037430900', text: 'Hello po!' })
  })

  it('a referral wins over the Get Started or text it rides on', () => {
    const events = parseWebhookBody(body(
      { ...from, timestamp: 1, postback: { payload: 'wn1|start', referral: { ref: 'ORDER_abc', source: 'SHORTLINK' } } },
      { ...from, timestamp: 2, referral: { ref: 'ORDER_def' } },
    ))
    expect(events?.map((event) => event.kind === 'referral' && event.ref)).toEqual(['ORDER_abc', 'ORDER_def'])
  })

  it('drops reads/deliveries and malformed items, keeps the rest', () => {
    const events = parseWebhookBody(body(
      { ...from, timestamp: 1, read: { watermark: 1 } },
      { sender: {}, timestamp: 2, message: { text: 'no sender id' } },
      { ...from, timestamp: 3, message: { mid: 'ok', text: 'menu' } },
    ))
    expect(events?.map((event) => event.dedupeKey)).toEqual(['mid:ok'])
  })
})

describe('Messenger link token', () => {
  const SECRET = 'test-secret'
  const SESSION = '0b0c9d3c-1111-4000-8000-000000000001'
  const now = new Date('2026-11-10T00:00:00Z')

  it('round-trips the session id', () => {
    const token = createMessengerLinkToken(SESSION, now, SECRET)
    expect(looksLikeMessengerLinkToken(token)).toBe(true)
    expect(readMessengerLinkToken(token, now, SECRET)).toBe(SESSION)
  })

  it('refuses expired, forged, other-secret and other-session tokens', () => {
    const token = createMessengerLinkToken(SESSION, now, SECRET) as string
    const later = new Date(now.getTime() + (MESSENGER_LINK_TTL_SECONDS + 1) * 1000)
    expect(readMessengerLinkToken(token, later, SECRET)).toBeNull()
    expect(readMessengerLinkToken(token, now, 'other-secret')).toBeNull()
    expect(readMessengerLinkToken(token.replace(SESSION, '0b0c9d3c-1111-4000-8000-000000000002'), now, SECRET)).toBeNull()
    expect(readMessengerLinkToken(`${token.slice(0, -1)}A`, now, SECRET)).toBeNull()
    expect(readMessengerLinkToken('24000000000000001', now, SECRET)).toBeNull()
  })

  it('makes nothing without a secret', () => {
    expect(createMessengerLinkToken(SESSION, now, undefined)).toBeNull()
    expect(readMessengerLinkToken('mt1.1.x.y', now, undefined)).toBeNull()
  })
})
