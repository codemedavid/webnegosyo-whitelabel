/**
 * The web's audience selection is a behaviour-identical port of the merchant
 * app's (webnegosyo-app/lib/sms/audience.ts): same veto order, same filter,
 * same recency sort. The parity block runs both over the same guests.
 */

import {
  AUDIENCE_PRESET_FILTERS, audienceLabelOf, matchAudiencePreset, selectAudience,
} from '@/lib/texts/audience'
import { selectAudience as appSelectAudience } from '../../../webnegosyo-app/lib/sms/audience'
import { AUDIENCE_SEGMENTS, matchAudienceSegment } from '../../../webnegosyo-app/lib/sms/campaign-wizard'
import type { AudienceFilter } from '@/lib/texts/types'
import { MIXED_GUESTS, NOW, guest } from './fixtures'

describe('selectAudience', () => {
  test('reports the first veto in the app order before the filter', () => {
    // Arrange
    const ctx = { now: NOW, suppressedPhones: [MIXED_GUESTS[4].phone_e164 as string], recentlyTextedPhones: [MIXED_GUESTS[6].phone_e164 as string] }

    // Act
    const result = selectAudience(MIXED_GUESTS, { minOrderCount: 1 }, ctx)

    // Assert
    expect(result.summary).toEqual({ no_phone: 2, no_consent: 1, opted_out: 1, suppressed: 1, recently_texted: 1, filter: 1 })
    expect(result.recipients.map((g) => g.id)).toEqual(['9', '1'])
  })

  test('sorts the warmest guests first and never mutates the input', () => {
    const input = [guest({ id: 'a', last_order_at: '2026-01-01T00:00:00Z' }), guest({ id: 'b', last_order_at: '2026-10-01T00:00:00Z' })]
    const copy = [...input]
    expect(selectAudience(input, {}, { now: NOW }).recipients.map((g) => g.id)).toEqual(['b', 'a'])
    expect(input).toEqual(copy)
  })

  test('a guest who never ordered sits outside both recency windows', () => {
    const never = [guest({ id: 'x', last_order_at: null })]
    expect(selectAudience(never, { lastOrderOlderThanDays: 30 }, { now: NOW }).recipients).toHaveLength(0)
    expect(selectAudience(never, { lastOrderWithinDays: 30 }, { now: NOW }).recipients).toHaveLength(0)
  })
})

describe('parity with the merchant app', () => {
  const filters: AudienceFilter[] = [
    {},
    { lastOrderOlderThanDays: 21 },
    { lastOrderWithinDays: 30 },
    { minOrderCount: 1, maxOrderCount: 1 },
    { minOrderCount: 3, minTotalSpent: 1000 },
    { channels: ['pos'] },
  ]

  test.each(filters)('same recipients, exclusions and summary for %j', (filter) => {
    const ctx = { now: NOW, suppressedPhones: [MIXED_GUESTS[0].phone_e164 as string], recentlyTextedPhones: [] }
    const web = selectAudience(MIXED_GUESTS, filter, ctx)
    const app = appSelectAudience(MIXED_GUESTS, filter, ctx)
    expect(web.recipients.map((g) => g.id)).toEqual(app.recipients.map((g) => g.id))
    expect(web.excluded).toEqual(app.excluded)
    expect(web.summary).toEqual(app.summary)
  })

  test('presets are the app wizard segments', () => {
    for (const segment of AUDIENCE_SEGMENTS) {
      expect(AUDIENCE_PRESET_FILTERS[segment.id]).toEqual(segment.filter)
      expect(matchAudiencePreset(segment.filter)).toBe(matchAudienceSegment(segment.filter))
      expect(audienceLabelOf(segment.id)).toBe(segment.title)
    }
  })
})

describe('matchAudiencePreset', () => {
  test('anything the chips cannot show is custom', () => {
    expect(matchAudiencePreset({ minTotalSpent: 500 })).toBe('custom')
    expect(matchAudiencePreset({ channels: ['pos'] })).toBe('custom')
    expect(matchAudiencePreset({ minOrderCount: 7 })).toBe('custom')
    expect(audienceLabelOf('custom')).toBe('Custom')
  })
})
