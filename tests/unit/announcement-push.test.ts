/**
 * On-command platform push for "What's New" announcements.
 *
 * Unlike order pushes (one tenant, one deployment), an announcement reaches
 * every merchant device on the platform from ONE table, so the recipient rule
 * has to do the audience filtering and the dedupe itself. Every rule fails
 * toward reaching a device rather than skipping it, except the audience: a
 * post aimed at three stores must never ring a fourth.
 */
import {
  buildAnnouncementPushMessages,
  collectStalePushTokens,
  selectAnnouncementRecipients,
} from '@/lib/push/announcement-push'

const TOKENS = [
  { token: 'ExponentPushToken[a]', user_id: 'u1', tenant_id: 't1' },
  { token: 'ExponentPushToken[b]', user_id: 'u2', tenant_id: 't2' },
  { token: 'ExponentPushToken[c]', user_id: 'u3', tenant_id: null },
  { token: 'ExponentPushToken[a]', user_id: 'u1-other', tenant_id: 't1' },
]

const POST = {
  id: 'ann-1',
  kind: 'post' as const,
  title: 'Kitchen Display is here',
  summary: 'Run the kitchen from a tablet.',
  push_title: null,
  push_body: null,
}

describe('selectAnnouncementRecipients', () => {
  it('reaches every device (dedupe by token) when the audience is everyone', () => {
    const result = selectAnnouncementRecipients(TOKENS, null)
    expect(result.map((r) => r.token)).toEqual([
      'ExponentPushToken[a]',
      'ExponentPushToken[b]',
      'ExponentPushToken[c]',
    ])
  })

  it('reaches only the audience tenants, never a device with no tenant', () => {
    const result = selectAnnouncementRecipients(TOKENS, ['t2'])
    expect(result.map((r) => r.token)).toEqual(['ExponentPushToken[b]'])
  })

  it('returns nothing for an empty audience list', () => {
    expect(selectAnnouncementRecipients(TOKENS, [])).toEqual([])
  })

  it('does not mutate its input', () => {
    const copy = TOKENS.map((t) => ({ ...t }))
    selectAnnouncementRecipients(copy, null)
    expect(copy).toEqual(TOKENS)
  })
})

describe('buildAnnouncementPushMessages', () => {
  it('uses the title and summary when no push copy is set', () => {
    const [msg] = buildAnnouncementPushMessages([TOKENS[0]], POST)
    expect(msg).toEqual({
      to: 'ExponentPushToken[a]',
      sound: 'default',
      title: 'Kitchen Display is here',
      body: 'Run the kitchen from a tablet.',
      data: { announcementId: 'ann-1', kind: 'post' },
    })
  })

  it('prefers explicit push copy over the post title', () => {
    const [msg] = buildAnnouncementPushMessages([TOKENS[0]], {
      ...POST,
      push_title: 'New: KDS',
      push_body: 'Tap to read',
    })
    expect(msg.title).toBe('New: KDS')
    expect(msg.body).toBe('Tap to read')
  })

  it('falls back to a generic body when there is neither summary nor push body', () => {
    const [msg] = buildAnnouncementPushMessages([TOKENS[0]], { ...POST, summary: null })
    expect(msg.body).toBe('Tap to read what’s new in WebNegosyo.')
  })

  it('builds one message per recipient', () => {
    expect(buildAnnouncementPushMessages(TOKENS.slice(0, 3), POST)).toHaveLength(3)
  })
})

describe('collectStalePushTokens', () => {
  it('returns the tokens whose ticket says the device is gone', () => {
    const messages = [
      { to: 'ExponentPushToken[a]' },
      { to: 'ExponentPushToken[b]' },
      { to: 'ExponentPushToken[c]' },
    ]
    const tickets = [
      { status: 'ok', id: '1' },
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } },
    ]
    expect(collectStalePushTokens(messages, tickets)).toEqual(['ExponentPushToken[b]'])
  })

  it('ignores a ticket list that does not line up with the messages', () => {
    expect(collectStalePushTokens([{ to: 'x' }], [])).toEqual([])
    expect(collectStalePushTokens([{ to: 'x' }], 'nope')).toEqual([])
  })
})
