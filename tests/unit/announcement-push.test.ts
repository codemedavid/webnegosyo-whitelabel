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
  describePushFailures,
  selectAnnouncementRecipients,
  staleTokensFrom,
  summarizeFailureCauses,
  summarizePushReceipts,
  summarizePushTickets,
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

describe('summarizePushTickets', () => {
  const messages = [
    { to: 'ExponentPushToken[a]' },
    { to: 'ExponentPushToken[b]' },
    { to: 'ExponentPushToken[c]' },
  ]

  it('hands back a receipt to chase for every device Expo accepted', () => {
    const tickets = [
      { status: 'ok', id: 'r1' },
      { status: 'ok', id: 'r2' },
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    ]
    const { receipts, failures } = summarizePushTickets(messages, tickets)
    expect(receipts).toEqual([
      { id: 'r1', token: 'ExponentPushToken[a]' },
      { id: 'r2', token: 'ExponentPushToken[b]' },
    ])
    expect(failures).toEqual([
      { token: 'ExponentPushToken[c]', error: 'DeviceNotRegistered', message: 'gone' },
    ])
  })

  it('reports the credential refusal that silently drops a whole platform', () => {
    const tickets = messages.map(() => ({
      status: 'error',
      message: 'Unable to retrieve the FCM server key',
      details: { error: 'InvalidCredentials' },
    }))
    const { receipts, failures } = summarizePushTickets(messages, tickets)
    expect(receipts).toEqual([])
    expect(failures.map((f) => f.error)).toEqual([
      'InvalidCredentials',
      'InvalidCredentials',
      'InvalidCredentials',
    ])
  })

  it('treats a reply that does not line up as unknown rather than delivered', () => {
    const { receipts, failures } = summarizePushTickets(messages, 'nope')
    expect(receipts).toEqual([])
    expect(failures).toHaveLength(3)
    expect(failures.every((f) => f.error === null)).toBe(true)
  })
})

describe('summarizePushReceipts', () => {
  const chasing = [
    { id: 'r1', token: 'ExponentPushToken[a]' },
    { id: 'r2', token: 'ExponentPushToken[b]' },
    { id: 'r3', token: 'ExponentPushToken[c]' },
  ]

  it('surfaces the FCM sender mismatch that never reaches the ticket', () => {
    const { failures, settledIds } = summarizePushReceipts(
      {
        r1: { status: 'ok' },
        r2: {
          status: 'error',
          message: 'The recipient is not registered with this FCM sender',
          details: { error: 'MismatchSenderId' },
        },
      },
      chasing
    )
    expect(settledIds).toEqual(['r1', 'r2'])
    expect(failures).toEqual([
      {
        token: 'ExponentPushToken[b]',
        error: 'MismatchSenderId',
        message: 'The recipient is not registered with this FCM sender',
      },
    ])
  })

  it('ignores receipts for ids it never asked about, and a malformed body', () => {
    expect(summarizePushReceipts({ other: { status: 'error' } }, chasing)).toEqual({
      failures: [],
      settledIds: [],
    })
    expect(summarizePushReceipts('nope', chasing)).toEqual({ failures: [], settledIds: [] })
  })
})

describe('staleTokensFrom', () => {
  it('deletes only the devices Expo says are gone, once each', () => {
    const failures = [
      { token: 'ExponentPushToken[a]', error: 'DeviceNotRegistered', message: null },
      { token: 'ExponentPushToken[a]', error: 'DeviceNotRegistered', message: null },
      { token: 'ExponentPushToken[b]', error: 'MismatchSenderId', message: null },
      { token: 'ExponentPushToken[c]', error: null, message: null },
    ]
    expect(staleTokensFrom(failures)).toEqual(['ExponentPushToken[a]'])
  })
})

describe('summarizeFailureCauses / describePushFailures', () => {
  const failures = [
    { token: 't1', error: 'MismatchSenderId', message: null },
    { token: 't2', error: 'MismatchSenderId', message: null },
    { token: 't3', error: 'DeviceNotRegistered', message: null },
    { token: 't4', error: null, message: null },
  ]

  it('counts the causes, commonest first', () => {
    expect(summarizeFailureCauses(failures)).toEqual([
      { error: 'MismatchSenderId', count: 2 },
      { error: 'DeviceNotRegistered', count: 1 },
      { error: 'unknown', count: 1 },
    ])
  })

  it('reads as one line an operator can act on', () => {
    expect(describePushFailures(failures)).toBe(
      '4 failed — MismatchSenderId 2, DeviceNotRegistered 1, unknown 1'
    )
  })

  it('says nothing when nothing failed', () => {
    expect(describePushFailures([])).toBeNull()
  })
})
