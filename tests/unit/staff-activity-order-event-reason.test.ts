import {
  ORDER_EVENT_NOTE_MAX,
  ORDER_EVENT_REASON_MAX,
  parseOrderEventReason,
} from '@/lib/staff-activity/order-event-reason'

describe('parseOrderEventReason', () => {
  it('is optional: nothing given → nulls', () => {
    expect(parseOrderEventReason({})).toEqual({ ok: true, value: { reason: null, note: null } })
    expect(parseOrderEventReason({ reason: null, note: undefined })).toEqual({ ok: true, value: { reason: null, note: null } })
  })

  it('trims and blanks out whitespace-only text', () => {
    expect(parseOrderEventReason({ reason: '  Customer left ', note: '   ' })).toEqual({
      ok: true,
      value: { reason: 'Customer left', note: null },
    })
  })

  it('refuses text over the limits and non-text', () => {
    expect(parseOrderEventReason({ reason: 'x'.repeat(ORDER_EVENT_REASON_MAX + 1) }).ok).toBe(false)
    expect(parseOrderEventReason({ note: 'x'.repeat(ORDER_EVENT_NOTE_MAX + 1) }).ok).toBe(false)
    expect(parseOrderEventReason({ reason: 42 }).ok).toBe(false)
    expect(parseOrderEventReason({ reason: 'x'.repeat(ORDER_EVENT_REASON_MAX) }).ok).toBe(true)
  })
})
