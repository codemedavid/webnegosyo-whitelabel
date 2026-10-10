/** @jest-environment node */
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

describe('isWithinStartWindow', () => {
  it('offers Start here for the first 60 days after the set-up began', async () => {
    const { isWithinStartWindow } = await import('@/lib/onboarding/start-here-eligibility')
    const now = Date.parse('2026-10-09T00:00:00Z')
    expect(isWithinStartWindow('2026-10-01T00:00:00Z', now)).toBe(true)
    expect(isWithinStartWindow('2026-08-11T00:00:00Z', now)).toBe(true)
    expect(isWithinStartWindow('2026-08-09T00:00:00Z', now)).toBe(false)
    expect(isWithinStartWindow('not a date', now)).toBe(false)
  })
})
