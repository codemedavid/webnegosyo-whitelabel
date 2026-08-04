/**
 * Validating an SMS campaign before it reaches the database.
 *
 * Every rule here mirrors a CHECK constraint on `public.sms_campaigns`
 * (migrations 20260816120000 and ...130000). Duplicating them in Zod is not
 * belt-and-braces: a constraint violation surfaces to an AI caller as an opaque
 * Postgres error it cannot act on, whereas a schema failure names the field.
 *
 * The rule that matters most is the schedule-fields one. Each `schedule_kind`
 * must carry the field that steers it — a weekly campaign with no weekdays, or
 * a one-off with no date, has nothing for the due-date computation to work from
 * and simply never fires. It sits there looking scheduled, forever.
 *
 * And the status default is DRAFT, deliberately diverging from the merchant
 * app (which saves campaigns live). A merchant filling in a form has said what
 * they want; an AI calling a tool has not earned the right to text a
 * restaurant's real customers unattended.
 */

import { smsCampaignDraftSchema, campaignDraftToRow } from '@/lib/sms-campaign-draft'

const VALID = {
  name: 'Win-back October',
  message_template: 'Hi {{firstName}}, we miss you! 10% off this week.',
  schedule_kind: 'one_off' as const,
  schedule_date: '2026-09-01',
}

describe('smsCampaignDraftSchema', () => {
  it('accepts a well-formed one-off campaign', () => {
    expect(() => smsCampaignDraftSchema.parse(VALID)).not.toThrow()
  })

  it('rejects an empty message, which the DB would reject too', () => {
    expect(() => smsCampaignDraftSchema.parse({ ...VALID, message_template: '   ' })).toThrow()
  })

  it('requires a date for a one-off campaign', () => {
    // Without it the campaign is never due: it never fires, and nothing on
    // screen explains why.
    expect(() =>
      smsCampaignDraftSchema.parse({ ...VALID, schedule_date: undefined }),
    ).toThrow(/schedule_date/i)
  })

  it('requires an interval for an every_n_days campaign', () => {
    expect(() =>
      smsCampaignDraftSchema.parse({
        ...VALID,
        schedule_kind: 'every_n_days',
        schedule_date: undefined,
      }),
    ).toThrow(/schedule_interval_days/i)
  })

  it('requires at least one weekday for a weekly campaign', () => {
    expect(() =>
      smsCampaignDraftSchema.parse({
        ...VALID,
        schedule_kind: 'weekly',
        schedule_date: undefined,
        schedule_weekdays: [],
      }),
    ).toThrow(/schedule_weekdays/i)
  })

  it('accepts a weekly campaign that names its weekdays', () => {
    expect(() =>
      smsCampaignDraftSchema.parse({
        ...VALID,
        schedule_kind: 'weekly',
        schedule_date: undefined,
        schedule_weekdays: [1, 5],
      }),
    ).not.toThrow()
  })

  it('rejects a weekday outside the ISO 1-7 range', () => {
    expect(() =>
      smsCampaignDraftSchema.parse({
        ...VALID,
        schedule_kind: 'weekly',
        schedule_date: undefined,
        schedule_weekdays: [0],
      }),
    ).toThrow()
  })

  it('rejects a non-positive interval', () => {
    expect(() =>
      smsCampaignDraftSchema.parse({
        ...VALID,
        schedule_kind: 'every_n_days',
        schedule_date: undefined,
        schedule_interval_days: 0,
      }),
    ).toThrow()
  })

  it('holds max_per_run inside the 1-200 the DB allows', () => {
    expect(() => smsCampaignDraftSchema.parse({ ...VALID, max_per_run: 0 })).toThrow()
    expect(() => smsCampaignDraftSchema.parse({ ...VALID, max_per_run: 201 })).toThrow()
    expect(() => smsCampaignDraftSchema.parse({ ...VALID, max_per_run: 25 })).not.toThrow()
  })

  it('rejects a malformed time, which would silently never match a due window', () => {
    expect(() => smsCampaignDraftSchema.parse({ ...VALID, schedule_time: '10am' })).toThrow()
    expect(() => smsCampaignDraftSchema.parse({ ...VALID, schedule_time: '25:00' })).toThrow()
    expect(() => smsCampaignDraftSchema.parse({ ...VALID, schedule_time: '09:30' })).not.toThrow()
  })

  it('rejects a malformed date', () => {
    expect(() => smsCampaignDraftSchema.parse({ ...VALID, schedule_date: '01-09-2026' })).toThrow()
  })
})

describe('campaignDraftToRow', () => {
  it('defaults a campaign to DRAFT so an AI cannot text real customers unattended', () => {
    const row = campaignDraftToRow('t1', smsCampaignDraftSchema.parse(VALID))

    expect(row.status).toBe('draft')
    expect(row.tenant_id).toBe('t1')
  })

  it('honours an explicit active status when the caller really means it', () => {
    const row = campaignDraftToRow('t1', smsCampaignDraftSchema.parse({ ...VALID, status: 'active' }))

    expect(row.status).toBe('active')
  })

  it('carries the conservative quiet hours by default', () => {
    // A 2am marketing text is how a SIM gets reported.
    const row = campaignDraftToRow('t1', smsCampaignDraftSchema.parse(VALID))

    expect(row.quiet_hours_start).toBe('21:00')
    expect(row.quiet_hours_end).toBe('08:00')
  })

  it('never writes consent, opt-out or suppression fields', () => {
    // Consent is captured from the customer at checkout. Nothing reachable from
    // a provisioning tool may manufacture it.
    const row = campaignDraftToRow('t1', smsCampaignDraftSchema.parse({
      ...VALID,
      sms_consent: true,
      sms_opt_out: false,
    } as never))

    expect(row).not.toHaveProperty('sms_consent')
    expect(row).not.toHaveProperty('sms_opt_out')
    expect(Object.keys(row).join(' ')).not.toMatch(/consent|opt_out|suppress/i)
  })

  it('passes the audience filter through untouched', () => {
    const audience = { lastOrderOlderThanDays: 30, minOrderCount: 2 }
    const row = campaignDraftToRow('t1', smsCampaignDraftSchema.parse({ ...VALID, audience }))

    expect(row.audience).toEqual(audience)
  })

  it('writes an empty weekday array for a non-weekly campaign, matching the column default', () => {
    const row = campaignDraftToRow('t1', smsCampaignDraftSchema.parse(VALID))

    expect(row.schedule_weekdays).toEqual([])
    expect(row.schedule_interval_days).toBeNull()
  })
})
