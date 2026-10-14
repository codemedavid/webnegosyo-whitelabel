/** @jest-environment node */
/**
 * The hero, assembled server-side. Quiet hours and the daily limit feed the
 * online rule; the best phone is the one the hero names; "sending" needs an
 * open run AND a ready phone; and any failed phone read is "unknown".
 */

// A module (not a script), so these test-file constants stay file-scoped.
export {}

jest.mock('server-only', () => ({}))
const readCampaignProgress = jest.fn()
jest.mock('@/lib/texts/server/campaign-reads', () => ({
  readCampaignProgress: (...args: unknown[]) => readCampaignProgress(...args),
}))

const NOW = new Date('2026-10-14T02:00:00Z') // 10:00 AM Manila
const SETTINGS = { quietHoursStart: '21:00', quietHoursEnd: '08:00', guestCapDays: 3, dailyLimit: 100, optOutLine: null, reviewUrl: null }
const OUTLOOK = { waiting: 12, sentToday: 37, dailyLimit: 100, finishAt: '2026-10-14T07:40:00.000Z' }
const row = (overrides: Record<string, unknown> = {}) => ({
  device_id: 'dev-1', label: "Juan's Galaxy A15", manufacturer: null, model: null, os_version: null, app_version: null,
  sms_permission: null, ignoring_battery_opt: null, last_seen_at: '2026-10-14T01:59:00Z', enrolled_at: null, enrolled_by: null,
  sent_today: 0, failed_today: 0, claimed_now: 0, ...overrides,
})
const run = { runId: 'r1', sent: 64, notSent: 3, waiting: 145, total: 212, finishAt: '2026-10-14T10:40:00.000Z', isQuietNow: false, isWaitingForPhone: false }

beforeEach(() => jest.clearAllMocks())

describe('summarise', () => {
  it('names the best phone and the queue', async () => {
    const { summarise } = await import('@/lib/texts/server/sender-summary')
    const summary = summarise({ now: NOW, settings: SETTINGS, outlook: OUTLOOK, rows: [row(), row({ device_id: 'dev-2', label: 'Backup', last_seen_at: null })], sending: null })
    expect(summary).toMatchObject({
      heroState: 'ready', waiting: 12, sentToday: 37, dailyLimit: 100, isQuietNow: false, quietUntil: null,
      allOutBy: OUTLOOK.finishAt, maxPhones: 5, now: NOW.toISOString(),
    })
    expect(summary.primary?.deviceId).toBe('dev-1')
    expect(summary.phones.map((p) => p.state)).toEqual(['ready', 'never'])
  })

  it('rests through quiet hours and says when they end', async () => {
    const { summarise } = await import('@/lib/texts/server/sender-summary')
    const night = new Date('2026-10-13T15:00:00Z') // 11:00 PM Manila
    const summary = summarise({ now: night, settings: SETTINGS, outlook: OUTLOOK, rows: [row({ last_seen_at: '2026-10-13T14:50:00Z' })], sending: null })
    expect(summary).toMatchObject({ heroState: 'resting', isQuietNow: true, quietUntil: '2026-10-14T00:00:00.000Z' })
  })

  it('says sending only while the best phone is ready', async () => {
    const { summarise } = await import('@/lib/texts/server/sender-summary')
    const sending = { id: 'c1', name: 'Weekend reminder', sent: 64, total: 212, finishAt: null }
    expect(summarise({ now: NOW, settings: SETTINGS, outlook: OUTLOOK, rows: [row()], sending }).heroState).toBe('sending')
    expect(summarise({ now: NOW, settings: SETTINGS, outlook: OUTLOOK, rows: [row({ last_seen_at: '2026-10-14T01:00:00Z' })], sending }).heroState).toBe('offline')
  })

  it('has no finish time when nothing waits, and is none with no phones', async () => {
    const { summarise } = await import('@/lib/texts/server/sender-summary')
    const summary = summarise({ now: NOW, settings: SETTINGS, outlook: { ...OUTLOOK, waiting: 0 }, rows: [], sending: null })
    expect(summary).toMatchObject({ heroState: 'none', allOutBy: null, primary: null })
  })
})

describe('pickSendingRun', () => {
  it('picks the open run with the most left and ignores finished ones', async () => {
    const { pickSendingRun } = await import('@/lib/texts/server/sender-summary')
    expect(pickSendingRun({ a: { ...run, total: 10, sent: 10, notSent: 0 }, b: run })?.campaignId).toBe('b')
    expect(pickSendingRun({})).toBeNull()
  })
})

function fakeDb({ rpcError = null as unknown, rows = [row()] } = {}) {
  const head = (count: number) => {
    const chain: Record<string, unknown> = {}
    for (const key of ['select', 'eq', 'gt', 'gte']) chain[key] = () => chain
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ count, error: null })
    return chain
  }
  const settingsChain = { select: () => settingsChain, eq: () => settingsChain, maybeSingle: async () => ({ data: null, error: null }) }
  const campaignChain = { select: () => campaignChain, eq: () => campaignChain, maybeSingle: async () => ({ data: { name: 'Weekend reminder' }, error: null }) }
  return {
    from: (table: string) => (table === 'sms_settings' ? settingsChain : table === 'sms_campaigns' ? campaignChain : head(3)),
    rpc: async () => (rpcError ? { data: null, error: rpcError } : { data: rows, error: null }),
  }
}

describe('readSenderSummary', () => {
  it('is unknown — never ready — when the phones cannot be read', async () => {
    const { readSenderSummary } = await import('@/lib/texts/server/sender-summary')
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    readCampaignProgress.mockResolvedValue({})
    const summary = await readSenderSummary(fakeDb({ rpcError: { message: 'timeout' } }) as never, 't-1', NOW)
    expect(summary.heroState).toBe('unknown')
    expect(summary.phones).toEqual([])
    errorSpy.mockRestore()
  })

  it('reads progress itself, or uses what the caller already read', async () => {
    const { readSenderSummary } = await import('@/lib/texts/server/sender-summary')
    readCampaignProgress.mockResolvedValue({ c1: run })
    const own = await readSenderSummary(fakeDb() as never, 't-1', NOW)
    expect(own.sending).toEqual({ id: 'c1', name: 'Weekend reminder', sent: 64, total: 212, finishAt: run.finishAt })
    expect(own.heroState).toBe('sending')
    readCampaignProgress.mockClear()
    const given = await readSenderSummary(fakeDb() as never, 't-1', NOW, { progress: {} })
    expect(readCampaignProgress).not.toHaveBeenCalled()
    expect(given).toMatchObject({ heroState: 'ready', sending: null })
  })

  it('keeps the phone state when only campaign progress fails', async () => {
    const { readSenderSummary } = await import('@/lib/texts/server/sender-summary')
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    readCampaignProgress.mockRejectedValue(new Error('no such column'))
    expect((await readSenderSummary(fakeDb() as never, 't-1', NOW)).heroState).toBe('ready')
    errorSpy.mockRestore()
  })
})
