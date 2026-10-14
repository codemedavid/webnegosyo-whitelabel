/**
 * planCampaignRun: one outbox row per guest who passes every veto and whose
 * text can be filled, warmest guests first (ranked by not_before so the claim
 * order keeps it), capped at the server ceiling, held out of quiet hours.
 */

import { CAMPAIGN_PRIORITY, SERVER_RUN_CEILING, planCampaignRun, type CampaignRunPlanInput } from '@/lib/texts/run-plan'
import { MIXED_GUESTS, NOW, daysAgo, guest } from './fixtures'

const HOUR = 3_600_000

function plan(overrides: Partial<CampaignRunPlanInput> = {}) {
  return planCampaignRun({
    tenantId: 't1',
    runId: 'run-1',
    customers: MIXED_GUESTS,
    filter: {},
    template: 'Hi {{firstName}}, see you at {{storeName}}!',
    store: { storeName: 'Kainan' },
    rules: { quietHoursStart: '21:00', quietHoursEnd: '08:00', optOutLine: 'Reply STOP to opt out' },
    suppressedPhones: [],
    recentlyTextedPhones: [],
    dueAt: NOW,
    now: NOW,
    expiryMs: 72 * HOUR,
    ...overrides,
  })
}

test('skips in the app veto order and counts every reason', () => {
  const result = plan({ suppressedPhones: [MIXED_GUESTS[0].phone_e164 as string], filter: { minOrderCount: 1 } })
  expect(result.summary).toEqual({
    no_phone: 2, no_consent: 1, opted_out: 1, suppressed: 1, recently_texted: 0, cannot_fill: 0, over_ceiling: 0,
  })
  expect(result.filteredOut).toBe(1)
  expect(result.rows.map((row) => row.customer_id)).toEqual(['9', '7', '5'])
})

test('writes campaign rows the outbox and the phone already understand', () => {
  const [row] = plan().rows
  expect(row).toMatchObject({
    tenant_id: 't1', automation_id: null, recipe: 'campaign', family: 'campaign', source: 'campaign',
    campaign_run_id: 'run-1', occurrence_key: 'run:run-1', priority: CAMPAIGN_PRIORITY,
    exit_if_ordered_after: null, entitlement_id: null,
    body: 'Hi Maria, see you at Kainan! Reply STOP to opt out',
  })
  expect(CAMPAIGN_PRIORITY).toBeGreaterThan(7) // automations (1..7) always go first
})

test('ranks by recency through not_before and expires each row after the window', () => {
  const { rows } = plan()
  const times = rows.map((row) => Date.parse(row.not_before))
  expect(times).toEqual([...times].sort((a, b) => a - b))
  expect(new Set(times).size).toBe(times.length)
  for (const row of rows) expect(Date.parse(row.expires_at) - Date.parse(row.not_before)).toBe(72 * HOUR)
})

test('a run planned during quiet hours starts when they end', () => {
  const night = new Date('2026-10-14T15:00:00Z') // 23:00 Manila
  const [first] = plan({ now: night, dueAt: night }).rows
  expect(first.not_before).toBe('2026-10-15T00:00:00.000Z') // 08:00 Manila
})

test('a guest whose text cannot be filled is skipped, never sent a blank', () => {
  const result = plan({ template: 'Hi {{firstName}}, last here {{lastOrderDate}}' })
  expect(result.summary.cannot_fill).toBe(1) // guest 6 never ordered
  expect(result.rows.some((row) => row.customer_id === '6')).toBe(false)
})

test('caps a big audience at the ceiling, keeping the warmest guests', () => {
  const many = Array.from({ length: 1200 }, (_, index) => guest({ id: String(index + 1), last_order_at: daysAgo(index / 10) }))
  const result = plan({ customers: many })
  expect(result.rows).toHaveLength(SERVER_RUN_CEILING)
  expect(result.summary.over_ceiling).toBe(1200 - SERVER_RUN_CEILING)
  expect(result.rows[0].customer_id).toBe('1')
})

test('offers up to five masked samples and the worst-case text count', () => {
  const result = plan({ template: `Hi {{firstName}} ${'x'.repeat(130)}` })
  expect(result.samples.length).toBeLessThanOrEqual(5)
  expect(result.samples[0]).toEqual({ label: 'Maria S.', body: expect.stringContaining('Hi Maria') })
  expect(result.maxSegments).toBe(2)
})
