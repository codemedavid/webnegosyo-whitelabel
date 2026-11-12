import type { AppCheckoutQuestion } from '@/lib/contract'
import { answersToSend, isQuestionAnswered, questionsFor, unansweredQuestions, upcomingDays } from './questions'

const question = (overrides: Partial<AppCheckoutQuestion>): AppCheckoutQuestion => ({
  id: 'q',
  orderTypeId: 'ot-pickup',
  name: 'q',
  label: 'Question',
  type: 'text',
  isRequired: false,
  placeholder: null,
  options: [],
  ...overrides,
})

const DATE = question({ id: 'q-date', name: 'pickup_date', label: 'Pickup date', type: 'date', isRequired: true })
const AGREE = question({ id: 'q-agree', name: 'agree', label: 'No refunds', type: 'checkbox', isRequired: true })
const TABLE = question({ id: 'q-table', name: 'table_number', label: 'Table', orderTypeId: 'ot-dine' })

describe('questionsFor', () => {
  it('keeps the chosen order type’s questions in order, none without one', () => {
    expect(questionsFor([DATE, TABLE, AGREE], 'ot-pickup').map((q) => q.id)).toEqual(['q-date', 'q-agree'])
    expect(questionsFor([DATE], undefined)).toEqual([])
  })
})

describe('answers', () => {
  it('a tick box answers only when ticked; anything else when not blank', () => {
    expect(isQuestionAnswered(AGREE, 'yes')).toBe(true)
    expect(isQuestionAnswered(AGREE, 'no')).toBe(false)
    expect(isQuestionAnswered(DATE, '  ')).toBe(false)
    expect(isQuestionAnswered(DATE, undefined)).toBe(false)
  })

  it('lists required questions still blank, worded for the place-order bar', () => {
    expect(unansweredQuestions([DATE, AGREE, TABLE], {})).toEqual(['Answer “Pickup date”', 'Tick “No refunds”'])
    expect(unansweredQuestions([DATE, AGREE], { 'q-date': '2026-11-13', 'q-agree': 'yes' })).toEqual([])
  })

  it('sends answered questions by name, trimmed; nothing when nothing is answered', () => {
    expect(answersToSend([DATE, AGREE, TABLE], { 'q-date': ' 2026-11-13 ', 'q-agree': '', 'q-table': '12', 'q-other': 'x' })).toEqual({
      pickup_date: '2026-11-13',
      table_number: '12',
    })
    expect(answersToSend([DATE], { 'q-date': ' ' })).toBeUndefined()
  })
})

describe('upcomingDays', () => {
  it('starts today in Manila, even when the UTC date is still yesterday', () => {
    // 2026-11-12 23:30 UTC = 2026-11-13 07:30 in Manila.
    const days = upcomingDays(Date.parse('2026-11-12T23:30:00Z'))
    expect(days).toHaveLength(14)
    expect(days.slice(0, 3)).toEqual([
      { value: '2026-11-13', label: 'Today' },
      { value: '2026-11-14', label: 'Tomorrow' },
      { value: '2026-11-15', label: 'Sun 15 Nov' },
    ])
    expect(days[13].value).toBe('2026-11-26')
  })

  it('crosses a month end', () => {
    expect(upcomingDays(Date.parse('2026-11-30T02:00:00Z'), 3).map((day) => day.value)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02'])
  })
})
