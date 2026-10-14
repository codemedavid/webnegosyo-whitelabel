import { finishEstimate } from '@/lib/texts/view/finish'

const NOW = Date.parse('2026-10-14T02:00:00Z') // Wed 10:00 AM Manila
const RULES = { quietHoursStart: '21:00', quietHoursEnd: '08:00', dailyLimit: 100 }

describe('finishEstimate', () => {
  test('nothing to send', () => {
    expect(finishEstimate({ texts: 0, start: NOW, now: NOW, isNow: true, waitingAhead: 0, sentToday: 0, rules: RULES })).toBeNull()
  })

  test('a small batch goes out within minutes', () => {
    const result = finishEstimate({ texts: 20, start: NOW, now: NOW, isNow: true, waitingAhead: 0, sentToday: 0, rules: RULES })
    expect(result?.text).toBe('20 texts · all out within a few minutes')
  })

  test('fits today: pace and finish', () => {
    const result = finishEstimate({ texts: 90, start: NOW, now: NOW, isNow: true, waitingAhead: 0, sentToday: 0, rules: RULES })
    expect(result?.text).toBe('90 texts · about 1 hr 30 min at 25 every 30 min · done around 11:30 AM')
    expect(result?.isLimitBound).toBe(false)
  })

  test('over the daily limit says how many days', () => {
    const result = finishEstimate({ texts: 212, start: NOW, now: NOW, isNow: true, waitingAhead: 0, sentToday: 0, rules: RULES })
    expect(result?.isLimitBound).toBe(true)
    expect(result?.text).toBe('212 texts · takes about 3 days at your limit of 100 · done Fri around 8:00 AM')
  })

  test('the queue ahead is named', () => {
    const result = finishEstimate({ texts: 20, start: NOW, now: NOW, isNow: true, waitingAhead: 12, sentToday: 0, rules: RULES })
    expect(result?.queueNote).toBe('12 texts are already in line ahead of it.')
  })

  test('runs into quiet hours', () => {
    const evening = Date.parse('2026-10-14T12:30:00Z') // 8:30 PM Manila
    const result = finishEstimate({ texts: 60, start: evening, now: evening, isNow: true, waitingAhead: 0, sentToday: 0, rules: RULES })
    expect(result?.text).toBe('60 texts · rests during quiet hours, continues at 8:00 AM · done tomorrow around 8:30 AM')
  })

  test('no promised times while the phone is away', () => {
    const base = { start: NOW, now: NOW, isNow: true, waitingAhead: 0, sentToday: 0, rules: RULES, isPhoneAway: true }
    expect(finishEstimate({ ...base, texts: 90 })).toMatchObject({ text: '90 texts · about 1 hr 30 min once your phone is back', finishAt: null })
    expect(finishEstimate({ ...base, texts: 212 })?.text).toBe('212 texts · takes about 3 days at your limit of 100 once your phone is back')
    expect(finishEstimate({ ...base, texts: 20 })?.text).toBe('20 texts · a few minutes once your phone is back')
  })
})
