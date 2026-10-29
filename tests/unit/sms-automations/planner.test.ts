/**
 * The planner turns "who qualifies" into "who gets a text now", and owns every
 * rule that protects a guest:
 *   - consent is mandatory (and opt-out / suppression always win),
 *   - one text per occurrence, ever (shared across a recipe family),
 *   - a re-entry gap per family,
 *   - ONE automated text per guest every N days across ALL automations, the
 *     highest-priority recipe winning,
 *   - quiet hours hold the text, they never drop it,
 *   - automatic mode texts only guests who qualified recently; "Run now"
 *     reaches the backlog too.
 */

import { planTexts, type PlanInput } from '@/lib/sms-automations/planner'
import type { AutomationRow, Candidate, GuestProfile, HistoryRow } from '@/lib/sms-automations/types'
import { getRecipe } from '@/lib/sms-automations/recipes'

const NOW = new Date('2026-10-12T04:00:00Z') // noon Manila
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()

function guest(id: string, overrides: Partial<GuestProfile> = {}): GuestProfile {
  return {
    id, name: `Ana ${id}`, phone: `+63917000${id.padStart(4, '0')}`, smsConsent: true, smsOptOut: false,
    orderCount: 3, totalSpent: 900, firstOrderAt: ago(90), lastOrderAt: ago(31), favoriteItem: 'Latte', ...overrides,
  }
}

function automation(recipe: AutomationRow['recipe'], overrides: Partial<AutomationRow> = {}): AutomationRow {
  return {
    id: `a-${recipe}`, tenant_id: 't1', recipe, name: recipe, params: {},
    message_template: getRecipe(recipe).defaultMessage, run_mode: 'auto', reentry_days: null,
    status: 'on', source: 'owner', created_at: ago(100), updated_at: ago(100), ...overrides,
  }
}

function candidate(g: GuestProfile, overrides: Partial<Candidate> = {}): Candidate {
  return { guest: g, occurrenceKey: `lapse:${g.lastOrderAt}`, dueAt: ago(1), expiresAt: ago(-100), ...overrides }
}

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    now: NOW,
    mode: 'fresh',
    store: { tenantId: 't1', storeName: 'Kape', baseUrl: 'https://kape.webnegosyo.com' },
    settings: {
      quietHoursStart: '21:00', quietHoursEnd: '08:00', guestCapDays: 3, dailyLimit: 100,
      optOutLine: null, reviewUrl: 'https://g.page/r/kape',
    },
    suppressedPhones: new Set(),
    history: [],
    work: [],
    ...overrides,
  }
}

function history(g: GuestProfile, overrides: Partial<HistoryRow>): HistoryRow {
  return {
    automation_id: 'a-win_back', recipe: 'win_back', customer_id: g.id, phone_e164: g.phone!,
    occurrence_key: 'x', status: 'sent', created_at: ago(1), sent_at: ago(1), ...overrides,
  }
}

describe('planTexts', () => {
  it('queues a rendered text with send-time guards', () => {
    const g = guest('1')
    const result = planTexts(input({ work: [{ automation: automation('win_back'), candidates: [candidate(g)] }] }))
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0]).toMatchObject({
      tenant_id: 't1', automation_id: 'a-win_back', recipe: 'win_back', customer_id: '1',
      phone_e164: g.phone, occurrence_key: `lapse:${g.lastOrderAt}`, source: 'auto',
      not_before: NOW.toISOString(), exit_if_ordered_after: g.lastOrderAt, entitlement_id: null,
    })
    expect(result.drafts[0].body).toMatch(/^Hi Ana, we miss you at Kape! It's been 31 days/)
    expect(result.reports.get('a-win_back')).toMatchObject({ qualifying: 1, queued: 1 })
  })

  it('never texts a guest without consent, opted out, or suppressed — and says why', () => {
    const work = [{ automation: automation('win_back'), candidates: [
      candidate(guest('1', { smsConsent: false })),
      candidate(guest('2', { smsOptOut: true })),
      candidate(guest('3')),
      candidate(guest('4', { phone: null })),
    ] }]
    const result = planTexts(input({ work, suppressedPhones: new Set([guest('3').phone!]) }))
    expect(result.drafts).toEqual([])
    expect(result.reports.get('a-win_back')?.skipped).toEqual({ no_consent: 1, opted_out: 1, suppressed: 1, no_phone: 1 })
  })

  it('sends one text per occurrence, shared across the lapse family', () => {
    const g = guest('1')
    const sentByRegulars = history(g, {
      automation_id: 'a-regulars_gone_quiet', recipe: 'regulars_gone_quiet',
      occurrence_key: `lapse:${g.lastOrderAt}`, created_at: ago(200), sent_at: ago(200),
    })
    const result = planTexts(input({ history: [sentByRegulars], work: [{ automation: automation('win_back'), candidates: [candidate(g)] }] }))
    expect(result.drafts).toEqual([])
    expect(result.reports.get('a-win_back')?.skipped).toEqual({ already_sent: 1 })
  })

  it('ignores an owner test text in the history instead of crashing the plan', () => {
    const g = guest('1')
    const testText = history(g, {
      automation_id: null, recipe: 'test' as HistoryRow['recipe'], customer_id: null, occurrence_key: 'test:1',
    })
    const result = planTexts(input({ history: [testText], work: [{ automation: automation('win_back'), candidates: [candidate(g)] }] }))
    expect(result.drafts).toHaveLength(1)
  })

  it('keeps the re-entry gap for a NEW occurrence in the same family', () => {
    const g = guest('1')
    const earlier = history(g, { occurrence_key: 'lapse:older', created_at: ago(20), sent_at: ago(20) })
    const result = planTexts(input({ history: [earlier], work: [{ automation: automation('win_back'), candidates: [candidate(g)] }] }))
    expect(result.reports.get('a-win_back')?.skipped).toEqual({ too_soon: 1 })
  })

  it('caps every guest at one automated text per N days, highest priority first', () => {
    const g = guest('1')
    const work = [
      { automation: automation('win_back'), candidates: [candidate(g)] },
      { automation: automation('loyalty_reward_waiting'), candidates: [candidate(g, {
        occurrenceKey: 'reward:e1', entitlementId: 'e1',
        loyalty: { remaining: 0, progressLeft: '', rewardName: 'Free Latte', rewardExpiresAt: null },
      })] },
    ]
    const result = planTexts(input({ work }))
    expect(result.drafts.map((d) => d.recipe)).toEqual(['loyalty_reward_waiting'])
    expect(result.drafts[0].entitlement_id).toBe('e1')
    expect(result.reports.get('a-win_back')?.skipped).toEqual({ texted_recently: 1 })
  })

  it('counts a text still waiting on the phone toward the cap', () => {
    const g = guest('1')
    const waiting = history(g, { automation_id: 'a-review_request', recipe: 'review_request', status: 'queued', created_at: ago(10), sent_at: null })
    const result = planTexts(input({ history: [waiting], work: [{ automation: automation('win_back'), candidates: [candidate(g)] }] }))
    expect(result.reports.get('a-win_back')?.skipped).toEqual({ texted_recently: 1 })
  })

  it('lets the cap lapse after N days', () => {
    const g = guest('1')
    const old = history(g, { automation_id: 'a-review_request', recipe: 'review_request', created_at: ago(4), sent_at: ago(4) })
    expect(planTexts(input({ history: [old], work: [{ automation: automation('win_back'), candidates: [candidate(g)] }] })).drafts).toHaveLength(1)
  })

  it('automatic mode leaves the backlog alone; Run now includes it', () => {
    const fresh = candidate(guest('1'), { dueAt: ago(1) })
    const backlog = candidate(guest('2'), { dueAt: ago(40) })
    const work = [{ automation: automation('win_back'), candidates: [fresh, backlog] }]
    expect(planTexts(input({ work })).drafts.map((d) => d.customer_id)).toEqual(['1'])
    const all = planTexts(input({ work, mode: 'all' }))
    expect(all.drafts.map((d) => d.customer_id).sort()).toEqual(['1', '2'])
    expect(all.drafts.every((d) => d.source === 'run_now')).toBe(true)
  })

  it('holds texts during quiet hours instead of dropping them', () => {
    const late = new Date('2026-10-12T14:30:00Z') // 22:30 Manila
    const result = planTexts(input({ now: late, work: [{ automation: automation('win_back'), candidates: [candidate(guest('1'), { dueAt: late.toISOString() })] }] }))
    expect(result.drafts[0].not_before).toBe('2026-10-13T00:00:00.000Z')
  })

  it('refuses the review recipe until the store has a review link', () => {
    const work = [{ automation: automation('review_request'), candidates: [candidate(guest('1'), { occurrenceKey: 'order:o1' })] }]
    const result = planTexts(input({ work, settings: { ...input().settings, reviewUrl: null } }))
    expect(result.drafts).toEqual([])
    expect(result.reports.get('a-review_request')?.skipped).toEqual({ missing_review_link: 1 })
  })

  it('appends the opt-out line and shows a masked sample of who is next', () => {
    const work = [{ automation: automation('win_back'), candidates: [candidate(guest('1', { name: 'Maria Santos' }))] }]
    const result = planTexts(input({ work, settings: { ...input().settings, optOutLine: 'Reply STOP to stop texts' } }))
    expect(result.drafts[0].body).toMatch(/Reply STOP to stop texts$/)
    expect(result.reports.get('a-win_back')?.sample).toEqual(['Maria S.'])
  })

  it('refuses a text longer than the outbox accepts instead of failing the whole batch', () => {
    const longFavorite = automation('win_back', { message_template: 'Hi {{firstName}}! Your {{favoriteItem}} awaits.' })
    const work = [{ automation: longFavorite, candidates: [candidate(guest('1', { favoriteItem: 'A'.repeat(1000) }))] }]
    const result = planTexts(input({ work }))
    expect(result.drafts).toEqual([])
    expect(result.reports.get('a-win_back')?.skipped).toEqual({ cannot_fill: 1 })
  })

  it('never lets a text outlive its moment or sit in the queue forever', () => {
    const result = planTexts(input({ work: [{ automation: automation('win_back'), candidates: [candidate(guest('1'), { expiresAt: ago(-400) })] }] }))
    expect(Date.parse(result.drafts[0].expires_at)).toBe(NOW.getTime() + 7 * DAY)
  })
})
