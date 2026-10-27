import { changedRules, draftFrom, parseFloatPesos } from '@/components/admin/cash/cash-rules-form'
import { DEFAULT_CASH_SETTINGS } from '@/lib/cash/settings'

describe('parseFloatPesos', () => {
  it('reads pesos into centavos; blank means each drawer’s own float', () => {
    expect(parseFloatPesos('')).toBeNull()
    expect(parseFloatPesos('2000')).toBe(200000)
    expect(parseFloatPesos('₱2,000.5')).toBe(200050)
    expect(parseFloatPesos('-5')).toBeUndefined()
    expect(parseFloatPesos('20.555')).toBeUndefined()
    expect(parseFloatPesos('abc')).toBeUndefined()
  })
})

describe('changedRules', () => {
  it('saves only what changed', () => {
    const draft = { ...draftFrom(DEFAULT_CASH_SETTINGS), blindClose: true, defaultFloatText: '2000' }

    expect(changedRules(DEFAULT_CASH_SETTINGS, draft)).toEqual({ ok: true, patch: { blindClose: true, defaultFloatCents: 200000 } })
  })

  it('is an empty patch when nothing changed', () => {
    expect(changedRules(DEFAULT_CASH_SETTINGS, draftFrom(DEFAULT_CASH_SETTINGS))).toEqual({ ok: true, patch: {} })
  })

  it('refuses a float that is not pesos', () => {
    expect(changedRules(DEFAULT_CASH_SETTINGS, { ...draftFrom(DEFAULT_CASH_SETTINGS), defaultFloatText: 'two thousand' }).ok).toBe(false)
  })

  it('round-trips a saved float', () => {
    const saved = { ...DEFAULT_CASH_SETTINGS, defaultFloatCents: 150050 }

    expect(changedRules(saved, draftFrom(saved))).toEqual({ ok: true, patch: {} })
  })
})
