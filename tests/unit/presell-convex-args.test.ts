/**
 * Convex rejects unknown mutation args, so `items[].presellDate` can only be
 * sent to a deployment whose validator knows it (schema v25+). Below that, the
 * field is omitted — the order still schedules correctly because the date also
 * rides in customerData, which every reader falls back to.
 */

import { convexPresellItemFields, CONVEX_PRESELL_MIN_VERSION } from '@/lib/presell/convex-args'

describe('convexPresellItemFields', () => {
  it('sends presellDate to a deployment at or above the presell schema version', () => {
    expect(convexPresellItemFields('2026-12-24', CONVEX_PRESELL_MIN_VERSION)).toEqual({ presellDate: '2026-12-24' })
    expect(convexPresellItemFields('2026-12-24', CONVEX_PRESELL_MIN_VERSION + 3)).toEqual({ presellDate: '2026-12-24' })
  })

  it('omits it for an older deployment', () => {
    expect(convexPresellItemFields('2026-12-24', CONVEX_PRESELL_MIN_VERSION - 1)).toEqual({})
  })

  it('treats an unknown version as too old', () => {
    expect(convexPresellItemFields('2026-12-24', null)).toEqual({})
    expect(convexPresellItemFields('2026-12-24', undefined)).toEqual({})
  })

  it('sends nothing for an ordinary line regardless of version', () => {
    expect(convexPresellItemFields(undefined, 99)).toEqual({})
  })

  it('pins the version that introduced the field', () => {
    expect(CONVEX_PRESELL_MIN_VERSION).toBe(25)
  })
})
