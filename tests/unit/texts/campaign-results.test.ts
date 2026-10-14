/** @jest-environment node */
/**
 * Results per run: what was sent / not sent / still waiting, who came back
 * (first non-cancelled order within 14 days of THEIR text) and what they
 * spent. Exact on the platform backend; "at least" elsewhere. A run whose
 * window closed is stored once and never re-read.
 */

import { createFakeDb } from './fake-db'

jest.mock('server-only', () => ({}))

const T = 't1'
const NOW = new Date('2026-10-30T00:00:00Z')

const serverRun = { id: 'r1', campaignId: 'c1', status: 'completed' as const, delivery: 'server' as const, dueAt: '2026-10-10T02:00:00Z', startedAt: '2026-10-10T02:00:00Z', completedAt: '2026-10-11T00:00:00Z', plannedCount: 3, audienceSummary: null, report: null, reportFinalAt: null }

function outbox(id: string, customerId: string, status: string, sentAt: string | null, extra: Record<string, unknown> = {}) {
  return { id, tenant_id: T, campaign_run_id: 'r1', customer_id: customerId, phone_e164: `+63917000000${id.slice(-1)}`, status, sent_at: sentAt, skip_reason: null, error: null, created_at: '2026-10-10T02:00:00Z', ...extra }
}

function seed() {
  return createFakeDb({
    sms_outbox: [
      outbox('o1', 'g1', 'sent', '2026-10-10T03:00:00Z'),
      outbox('o2', 'g2', 'sent', '2026-10-10T03:10:00Z'),
      outbox('o3', 'g3', 'expired', null, { skip_reason: 'expired' }),
    ],
    sms_sends: [],
    orders: [
      { id: 'x1', tenant_id: T, customer_id: 'g1', created_at: '2026-10-12T00:00:00Z', total: 320, status: 'delivered' },
      { id: 'x2', tenant_id: T, customer_id: 'g1', created_at: '2026-10-13T00:00:00Z', total: 999, status: 'delivered' },
      { id: 'x3', tenant_id: T, customer_id: 'g2', created_at: '2026-10-11T00:00:00Z', total: 500, status: 'cancelled' },
      { id: 'x4', tenant_id: T, customer_id: 'g2', created_at: '2026-10-29T00:00:00Z', total: 700, status: 'delivered' },
    ],
    customers: [
      { id: 'g1', tenant_id: T, last_order_at: '2026-10-13T00:00:00Z' },
      { id: 'g2', tenant_id: T, last_order_at: '2026-10-29T00:00:00Z' },
    ],
    sms_campaign_runs: [{ id: 'r1', tenant_id: T, report: null, report_final_at: null }],
  })
}

test('platform: counts the first non-cancelled order within 14 days, and its total', async () => {
  const { computeRunResults } = await import('@/lib/texts/server/campaign-results')
  const db = seed()

  const results = await computeRunResults(db.client, T, 'platform', [serverRun], NOW)

  expect(results.get('r1')).toMatchObject({
    sent: 2, notSent: 1, waiting: 0, cameBack: 1, sales: 320, isFinal: true, finalOn: '2026-10-24',
    notSentByReason: [{ reason: 'Ran out of time', count: 1 }],
  })
})

test('a final run is stored once and then read from the run', async () => {
  const { computeRunResults } = await import('@/lib/texts/server/campaign-results')
  const db = seed()
  await computeRunResults(db.client, T, 'platform', [serverRun], NOW)
  expect(db.tables.sms_campaign_runs[0]).toMatchObject({ report_final_at: NOW.toISOString(), report: expect.objectContaining({ cameBack: 1 }) })

  const cached = { ...serverRun, report: db.tables.sms_campaign_runs[0].report, reportFinalAt: NOW.toISOString() }
  db.tables.sms_outbox.length = 0
  expect((await computeRunResults(db.client, T, 'platform', [cached], NOW)).get('r1')).toMatchObject({ sent: 2, cameBack: 1 })
})

test('other backends: approximate from last_order_at, lower bound, no sales', async () => {
  const { computeRunResults } = await import('@/lib/texts/server/campaign-results')
  const results = await computeRunResults(seed().client, T, 'convex', [serverRun], NOW)
  expect(results.get('r1')).toMatchObject({ cameBack: 1, sales: 0 })
})

test('a run still inside its window is not final', async () => {
  const { computeRunResults } = await import('@/lib/texts/server/campaign-results')
  const results = await computeRunResults(seed().client, T, 'platform', [serverRun], new Date('2026-10-20T00:00:00Z'))
  expect(results.get('r1')).toMatchObject({ isFinal: false, finalOn: '2026-10-24' })
})

test('phone-sent runs read sms_sends', async () => {
  const { computeRunResults } = await import('@/lib/texts/server/campaign-results')
  const db = createFakeDb({
    sms_sends: [
      { id: 's1', tenant_id: T, run_id: 'p1', customer_id: 'g1', phone_e164: '+639170000001', result: 'sent', sent_at: '2026-10-10T03:00:00Z' },
      { id: 's2', tenant_id: T, run_id: 'p1', customer_id: 'g2', phone_e164: '+639170000002', result: 'failed', sent_at: '2026-10-10T03:00:00Z' },
    ],
    sms_outbox: [], orders: [], sms_campaign_runs: [{ id: 'p1', tenant_id: T }],
  })
  const results = await computeRunResults(db.client, T, 'platform', [{ ...serverRun, id: 'p1', delivery: 'phone' }], NOW)
  expect(results.get('p1')).toMatchObject({ sent: 1, notSent: 1, notSentByReason: [{ reason: "Phone couldn't send", count: 1 }] })
})

test('totalsOf adds runs up and stays null before anything went out', async () => {
  const { totalsOf } = await import('@/lib/texts/server/campaign-results')
  const run = { runId: 'a', sent: 2, notSent: 1, waiting: 0, cameBack: 1, sales: 300, notSentByReason: [], isFinal: true, finalOn: '2026-10-01', startedAt: null }
  expect(totalsOf([run, { ...run, runId: 'b', isFinal: false, finalOn: '2026-10-20' }], false))
    .toEqual({ sent: 4, notSent: 2, cameBack: 2, sales: 600, isFinal: false, finalOn: '2026-10-20', isApproximate: false })
  expect(totalsOf([], true)).toBeNull()
})

test('a run whose texts cannot be read is left out, the rest still count (review item 3)', async () => {
  const { computeRunResults } = await import('@/lib/texts/server/campaign-results')
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  const db = createFakeDb({ sms_outbox: [], sms_sends: [{ id: 's1', tenant_id: T, run_id: 'p1', customer_id: 'g1', phone_e164: '+639170000001', result: 'sent', sent_at: '2026-10-10T03:00:00Z' }], orders: [], sms_campaign_runs: [] },
    { readErrors: { sms_outbox: 'statement timeout' } })
  const results = await computeRunResults(db.client, T, 'platform', [serverRun, { ...serverRun, id: 'p1', delivery: 'phone' }], NOW)
  expect(results.has('r1')).toBe(false)
  expect(results.get('p1')).toMatchObject({ sent: 1 })
  errorSpy.mockRestore()
})

test('run ids are read in small groups so a group stays under the row cap', async () => {
  const { RUNS_PER_SEND_READ } = await import('@/lib/texts/server/campaign-results')
  const { SERVER_RUN_CEILING } = await import('@/lib/texts/run-plan')
  expect(RUNS_PER_SEND_READ * SERVER_RUN_CEILING).toBeLessThan(20_000)
})
