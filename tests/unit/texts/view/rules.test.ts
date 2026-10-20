import { RULE_HINTS, coversQuietFloor, dailyLimitNote, quietHoursProblem, rulesForSave, rulesProblems, sameRules } from '@/lib/texts/view/rules'

const RULES = { quietHoursStart: '21:00', quietHoursEnd: '08:00', guestCapDays: 3, dailyLimit: 100, optOutLine: null, reviewUrl: null }

describe('rules', () => {
  test('no opt-out line is offered: nothing handles replies', () => {
    expect(Object.keys(RULE_HINTS)).not.toContain('optOutLine')
    expect(JSON.stringify(RULE_HINTS)).not.toMatch(/STOP/i)
  })

  test('quiet hours must cover 9 PM to 7 AM', () => {
    expect(coversQuietFloor({ quietHoursStart: '21:00', quietHoursEnd: '07:00' })).toBe(true)
    expect(coversQuietFloor({ quietHoursStart: '20:00', quietHoursEnd: '09:00' })).toBe(true)
    expect(coversQuietFloor({ quietHoursStart: '22:00', quietHoursEnd: '07:00' })).toBe(false)
    expect(coversQuietFloor({ quietHoursStart: '21:00', quietHoursEnd: '06:30' })).toBe(false)
    expect(coversQuietFloor({ quietHoursStart: '09:00', quietHoursEnd: '17:00' })).toBe(false)
    expect(quietHoursProblem({ quietHoursStart: '22:00', quietHoursEnd: '07:00' }))
      .toBe("Quiet hours must cover at least 9 PM to 7 AM. That's the rule for promo texts in the Philippines.")
  })

  test('daily limit note above 200', () => {
    expect(dailyLimitNote(200)).toBeNull()
    expect(dailyLimitNote(250)).toBe('High for one SIM. Consider a second phone.')
  })

  test('problems', () => {
    expect(rulesProblems(RULES)).toEqual({})
    expect(rulesProblems({ ...RULES, reviewUrl: 'g.page/x', dailyLimit: 0 })).toEqual({
      reviewUrl: 'Paste the full review link, starting with https://',
      dailyLimit: 'The daily limit must be between 1 and 500.',
    })
  })

  test('save shape and dirty check', () => {
    expect(rulesForSave({ ...RULES, reviewUrl: '  ' })).toMatchObject({ reviewUrl: null, optOutLine: null })
    expect(rulesForSave({ ...RULES, optOutLine: 'Existing line' }).optOutLine).toBe('Existing line')
    expect(sameRules(RULES, { ...RULES, reviewUrl: '' })).toBe(true)
    expect(sameRules(RULES, { ...RULES, dailyLimit: 50 })).toBe(false)
  })
})
