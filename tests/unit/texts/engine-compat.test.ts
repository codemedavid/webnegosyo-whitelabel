/** @jest-environment node */
/**
 * Campaign rows share sms_outbox with automations. These pin the seams:
 *  - the planner reads campaign history (it caps the guest) without throwing;
 *  - listActivity hides campaign rows from shipped apps unless asked;
 *  - texting rules must cover 9 PM–7 AM (owner decision 2);
 *  - the migration's CHECK values match what the code writes.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { planTexts } from '@/lib/sms-automations/planner'
import { normalizeSettings, parseAutomationRequest, QUIET_HOURS_FLOOR_ERROR } from '@/lib/sms-automations/api/schema'
import { DEFAULT_SETTINGS } from '@/lib/sms-automations/rows'
import { CAMPAIGN_PRIORITY, CAMPAIGN_RECIPE } from '@/lib/texts/run-plan'
import type { AutomationRow, Candidate, HistoryRow } from '@/lib/sms-automations/types'
import { createFakeDb } from './fake-db'

jest.mock('server-only', () => ({}))

const NOW = new Date('2026-10-14T02:00:00Z')

describe('planner with campaign history', () => {
  const automation: AutomationRow = {
    id: 'a1', tenant_id: 't', recipe: 'win_back', name: 'We miss you', params: { inactiveDays: 30 },
    message_template: 'Hi {{firstName}}', run_mode: 'auto', reentry_days: null, status: 'on', source: 'owner',
    created_at: '', updated_at: '',
  }
  const candidate: Candidate = {
    guest: { id: 'g1', name: 'Maria', phone: '+639170000001', smsConsent: true, smsOptOut: false, orderCount: 3, totalSpent: 900, firstOrderAt: null, lastOrderAt: '2026-08-01T00:00:00Z', favoriteItem: null },
    occurrenceKey: 'lapse:1', dueAt: '2026-10-14T01:00:00Z', expiresAt: '2026-10-20T00:00:00Z',
  }
  const campaignRow: HistoryRow = {
    automation_id: null, recipe: 'campaign', customer_id: 'g1', phone_e164: '+639170000001',
    occurrence_key: 'run:r1', status: 'queued', created_at: '2026-10-14T00:00:00Z', sent_at: null,
  }

  test('a waiting campaign text caps the guest instead of throwing', () => {
    const result = planTexts({
      now: NOW, mode: 'all', store: { tenantId: 't', storeName: 'S', baseUrl: 'https://s.example' },
      settings: { ...DEFAULT_SETTINGS }, suppressedPhones: new Set(), history: [campaignRow],
      work: [{ automation, candidates: [candidate] }],
    })
    expect(result.drafts).toHaveLength(0)
    expect(result.reports.get('a1')?.skipped).toEqual({ texted_recently: 1 })
  })
})

describe('listActivity', () => {
  const RUN = '00000000-0000-4000-8000-00000000a001'
  const CAMPAIGN = '00000000-0000-4000-8000-00000000c001'
  function db() {
    const row = (id: string, created: string, extra: Record<string, unknown>) => ({
      id, tenant_id: 't', automation_id: null, recipe: 'win_back', phone_e164: '+639170001234', body: 'Hi', status: 'sent',
      skip_reason: null, error: null, source: 'auto', not_before: created, created_at: created, sent_at: created, campaign_run_id: null, ...extra,
    })
    return createFakeDb({
      sms_outbox: [
        row('o1', '2026-10-14T01:00:00Z', { automation_id: 'a1' }),
        row('o2', '2026-10-14T01:05:00Z', { recipe: 'campaign', source: 'campaign', campaign_run_id: RUN }),
      ],
      sms_campaign_runs: [{ id: RUN, tenant_id: 't', campaign_id: CAMPAIGN }],
      sms_campaigns: [{ id: CAMPAIGN, tenant_id: 't', name: 'Weekend promo' }],
    })
  }

  test('hides campaign rows by default (shipped apps) and never selects the new column', async () => {
    const { listActivity } = await import('@/lib/sms-automations/api/reads')
    const fake = db()
    const page = await listActivity(fake.client, 't', {})
    expect(page.items.map((item) => [item.id, item.campaignId, item.campaignName])).toEqual([['o1', null, null]])
    const selects = fake.calls.filter((c) => c.table === 'sms_outbox' && c.op === 'select').map((c) => String(c.args[0]))
    expect(selects.every((columns) => !columns.includes('campaign_run_id'))).toBe(true)
  })

  test('the web can include campaign rows, named', async () => {
    const { listActivity } = await import('@/lib/sms-automations/api/reads')
    const page = await listActivity(db().client, 't', { includeCampaigns: true })
    expect(page.items.map((item) => [item.id, item.campaignId, item.campaignName])).toEqual([
      ['o2', CAMPAIGN, 'Weekend promo'], ['o1', null, null],
    ])
  })

  test('one campaign (all its runs) or one run', async () => {
    const { listActivity } = await import('@/lib/sms-automations/api/reads')
    expect((await listActivity(db().client, 't', { campaignId: CAMPAIGN })).items.map((item) => item.id)).toEqual(['o2'])
    expect((await listActivity(db().client, 't', { campaignRunId: RUN })).items.map((item) => item.id)).toEqual(['o2'])
    expect((await listActivity(db().client, 't', { campaignId: '00000000-0000-4000-8000-00000000c999' })).items).toEqual([])
  })

  test('the request schema accepts the web options', () => {
    const parsed = parseAutomationRequest({ action: 'activity', tenantId: '00000000-0000-4000-8000-000000000001', includeCampaigns: true, campaignId: CAMPAIGN })
    expect(parsed.success).toBe(true)
  })
})

describe('quiet-hours floor', () => {
  const base = { guestCapDays: 3, dailyLimit: 100, optOutLine: null, reviewUrl: null }

  test.each([['21:00', '08:00'], ['20:00', '09:00'], ['21:00', '07:00'], ['19:30', '10:15']])(
    'accepts %s–%s', (start, end) => {
      expect(normalizeSettings({ ...base, quietHoursStart: start, quietHoursEnd: end }).ok).toBe(true)
    })

  // 22:00–07:00 (an app RulesPanel pill) leaves 9–10 PM open: refused, reported to the lead.
  test.each([['22:00', '07:00'], ['22:00', '08:00'], ['21:00', '06:30'], ['23:00', '05:00'], ['08:00', '21:00'], ['00:00', '07:00']])(
    'refuses %s–%s', (start, end) => {
      expect(normalizeSettings({ ...base, quietHoursStart: start, quietHoursEnd: end })).toEqual({ ok: false, error: QUIET_HOURS_FLOOR_ERROR })
    })

  test('says why in the owner\'s words', () => {
    expect(QUIET_HOURS_FLOOR_ERROR).toBe("Quiet hours must cover at least 9 PM to 7 AM. That's the rule for promo texts in the Philippines.")
  })
})

describe('migrations match the code', () => {
  const sql = (name: string) => readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8')

  test('the outbox accepts what a campaign run writes', () => {
    const outbox = sql('20261015121000_sms_outbox_campaign_rows.sql')
    expect(outbox).toMatch(new RegExp(`sms_outbox_recipe_check check \\(recipe in \\([^)]*'${CAMPAIGN_RECIPE}'`))
    expect(outbox).toMatch(new RegExp(`sms_outbox_source_check check \\(source in \\([^)]*'${CAMPAIGN_RECIPE}'`))
    expect(CAMPAIGN_PRIORITY).toBeLessThanOrEqual(99) // sms_outbox_priority_check
  })

  test('campaigns know the scheduled status and both pause reasons', () => {
    const campaigns = sql('20261015120000_sms_campaigns_server_delivery.sql')
    expect(campaigns).toContain("check (status in ('draft', 'active', 'paused', 'archived', 'scheduled'))")
    expect(campaigns).toContain("pause_reason in ('owner', 'missed_no_phone')")
  })
})
