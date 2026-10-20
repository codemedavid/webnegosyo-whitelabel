import {
  AUDIENCE_SEGMENTS,
  applySegment,
  audienceCountText,
  filterForPreset,
  presetForFilter,
  skippedLines,
  zeroReachReason,
} from '@/lib/texts/view/audience'

describe('audience presets', () => {
  test('same numbers as the merchant app', () => {
    expect(AUDIENCE_SEGMENTS.map((s) => s.id)).toEqual(['everyone', 'lapsed', 'regulars', 'first_timers', 'recent'])
    expect(filterForPreset('lapsed')).toEqual({ lastOrderOlderThanDays: 21 })
    expect(filterForPreset('regulars')).toEqual({ minOrderCount: 3 })
    expect(filterForPreset('first_timers')).toEqual({ minOrderCount: 1, maxOrderCount: 1 })
    expect(filterForPreset('recent')).toEqual({ lastOrderWithinDays: 30 })
    expect(filterForPreset('everyone')).toEqual({})
  })

  test('round-trips every preset', () => {
    for (const segment of AUDIENCE_SEGMENTS) expect(presetForFilter(filterForPreset(segment.id))).toBe(segment.id)
  })

  test('anything hand-made is custom', () => {
    expect(presetForFilter({ minOrderCount: 2 })).toBe('custom')
    expect(presetForFilter({ minOrderCount: 3, minTotalSpent: 500 })).toBe('custom')
    expect(presetForFilter({ channels: ['pos'] })).toBe('custom')
  })

  test('applySegment replaces the filter (chips reset custom fields)', () => {
    expect(applySegment('regulars')).toEqual({ minOrderCount: 3 })
  })
})

describe('audience count copy', () => {
  test('count line', () => {
    expect(audienceCountText(148)).toBe('148 guests will get this')
    expect(audienceCountText(1)).toBe('1 guest will get this')
  })

  test('skipped lines, biggest first, with the guest cap', () => {
    expect(skippedLines({ no_consent: 31, opted_out: 9, recently_texted: 14, no_phone: 8 }, 3)).toEqual([
      "31 haven't agreed to texts",
      '14 got a text in the last 3 days',
      '9 opted out',
      '8 have no phone number',
    ])
    expect(skippedLines({ recently_texted: 1 }, 1)).toEqual(['1 got a text in the last day'])
  })

  test('zero reach names the main reason', () => {
    expect(zeroReachReason({ no_consent: 40, opted_out: 2 })).toEqual({
      text: 'None of your guests have agreed to texts. Guests agree at checkout, or you can mark it in Customers.',
      linksToCustomers: true,
    })
    expect(zeroReachReason({}).linksToCustomers).toBe(false)
  })
})

describe('describeCustomAudience', () => {
  it('says who a hand-made audience is in one line', async () => {
    const { describeCustomAudience } = await import('@/lib/texts/view/audience')
    expect(describeCustomAudience({ minOrderCount: 2 })).toBe('2+ orders')
    expect(describeCustomAudience({ minOrderCount: 2, lastOrderOlderThanDays: 14 })).toBe('2+ orders · no order in 14+ days')
    expect(describeCustomAudience({ maxOrderCount: 1, minTotalSpent: 1500 })).toBe('At most 1 order · spent ₱1,500+')
    expect(describeCustomAudience({})).toBe('Your own filter')
  })
})
