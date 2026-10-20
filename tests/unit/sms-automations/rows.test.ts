/**
 * Database rows → engine shapes. Rows come from tables other code writes
 * (customers.top_items, loyalty terms, an automation's params), so every
 * mapper tolerates junk instead of crashing a whole store's tick.
 */

import {
  DEFAULT_SETTINGS,
  automationFromRow,
  entitlementFromRow,
  guestFromCustomerRow,
  settingsFromRow,
} from '@/lib/sms-automations/rows'

describe('settingsFromRow', () => {
  it('uses the defaults when the store never saved its rules', () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({
      quietHoursStart: '21:00', quietHoursEnd: '08:00', guestCapDays: 3, dailyLimit: 100,
      optOutLine: null, reviewUrl: null,
    })
  })

  it('maps a saved row', () => {
    expect(settingsFromRow({
      quiet_hours_start: '22:00', quiet_hours_end: '07:30', guest_cap_days: 5, daily_limit: 40,
      opt_out_line: 'Reply STOP to stop texts', review_url: 'https://g.page/r/kape',
    })).toEqual({
      quietHoursStart: '22:00', quietHoursEnd: '07:30', guestCapDays: 5, dailyLimit: 40,
      optOutLine: 'Reply STOP to stop texts', reviewUrl: 'https://g.page/r/kape',
    })
  })
})

describe('guestFromCustomerRow', () => {
  const row = {
    id: 'c1', name: 'Ana Cruz', phone_e164: '+639170000001', sms_consent: true, sms_opt_out: false,
    order_count: 4, total_spent: '1250.50', first_order_at: '2026-01-01T00:00:00Z', last_order_at: '2026-09-01T00:00:00Z',
    top_items: [{ name: 'Latte', quantity: 2 }, { name: 'Spanish Latte', quantity: 5 }],
  }

  it('maps the profile and picks the most-ordered item as the favourite', () => {
    expect(guestFromCustomerRow(row)).toEqual({
      id: 'c1', name: 'Ana Cruz', phone: '+639170000001', smsConsent: true, smsOptOut: false,
      orderCount: 4, totalSpent: 1250.5, firstOrderAt: '2026-01-01T00:00:00Z', lastOrderAt: '2026-09-01T00:00:00Z',
      favoriteItem: 'Spanish Latte',
    })
  })

  it('survives malformed top_items and numbers', () => {
    const guest = guestFromCustomerRow({ ...row, top_items: [{ quantity: 9 }, 'x', null], order_count: null, total_spent: 'abc' })
    expect(guest.favoriteItem).toBeNull()
    expect(guest.orderCount).toBe(0)
    expect(guest.totalSpent).toBe(0)
    expect(guestFromCustomerRow({ ...row, top_items: { not: 'an array' } }).favoriteItem).toBeNull()
  })
})

describe('automationFromRow', () => {
  const row = {
    id: 'a1', tenant_id: 't1', recipe: 'win_back', name: 'We miss you', params: { inactiveDays: 45, junk: 'x', delayHours: 'NaN' },
    message_template: 'Hi {{firstName}}', run_mode: 'auto', reentry_days: null, status: 'on', source: 'owner',
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  }

  it('keeps only numeric knobs the engine knows', () => {
    expect(automationFromRow(row)?.params).toEqual({ inactiveDays: 45 })
  })

  it('refuses a row the engine cannot run', () => {
    expect(automationFromRow({ ...row, recipe: 'birthday' })).toBeNull()
    expect(automationFromRow({ ...row, run_mode: 'sometimes' })).toBeNull()
    expect(automationFromRow({ ...row, params: null })?.params).toEqual({})
  })
})

describe('entitlementFromRow', () => {
  const reward = { type: 'fixed', amount: 50 }
  it('maps a phone member reward', () => {
    expect(entitlementFromRow({
      id: 'e1', customer_key: 'phone:+639170000001', issued_at: '2026-10-01T00:00:00Z', expires_at: null, terms: { reward },
    })).toEqual({ id: 'e1', customerKey: 'phone:+639170000001', issuedAt: '2026-10-01T00:00:00Z', expiresAt: null, terms: { reward } })
  })

  it('drops a reward without terms', () => {
    expect(entitlementFromRow({ id: 'e1', customer_key: 'phone:+1', issued_at: 'x', expires_at: null, terms: {} })).toBeNull()
    expect(entitlementFromRow({ id: 'e1', customer_key: 'phone:+1', issued_at: 'x', expires_at: null, terms: null })).toBeNull()
  })
})
