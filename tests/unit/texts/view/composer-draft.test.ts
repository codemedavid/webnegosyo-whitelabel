import {
  blankDraft,
  draftFromItem,
  draftFromPreset,
  draftToInput,
  isDraftDirty,
  MAX_REPEAT_DAYS,
  nameProblem,
  quietNote,
  whenProblem,
} from '@/lib/texts/view/composer-draft'
import { CAMPAIGN_PRESETS } from '@/lib/texts/view/presets'
import { messageProblem } from '@/lib/texts/view/message'
import type { CampaignListItem } from '@/lib/texts/types'

const NOW = Date.parse('2026-10-14T06:10:00Z') // Wed 2:10 PM Manila
const RULES = { quietHoursStart: '21:00', quietHoursEnd: '08:00' }

describe('composer drafts', () => {
  test('blank draft: everyone, now, repeat ends in 8 weeks', () => {
    const draft = blankDraft(NOW)
    expect(draft).toMatchObject({ name: 'Untitled campaign', audience: {}, when: 'now', laterDate: '2026-10-15', endsOn: '2026-12-09' })
  })

  test('every preset is valid on arrival', () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const draft = draftFromPreset(preset, NOW)
      expect(nameProblem(draft.name)).toBeNull()
      expect(messageProblem(draft.messageTemplate)).toBeNull()
      expect(whenProblem(draft, NOW)).toBeNull()
    }
  })

  test('weekly preset maps to Repeat with its weekday', () => {
    const draft = draftFromPreset(CAMPAIGN_PRESETS[0], NOW)
    expect(draft).toMatchObject({ when: 'repeat', repeatKind: 'weekly', weekdays: [5], time: '10:00' })
    expect(draftToInput(draft, NOW).schedule).toEqual({
      kind: 'weekly', time: '10:00', date: null, intervalDays: null, weekdays: [5], endsOn: '2026-12-09',
    })
  })

  test('now saves a one-off dated today at the current minute', () => {
    const input = draftToInput({ ...blankDraft(NOW), messageTemplate: 'Hi' }, NOW)
    expect(input.schedule).toEqual({ kind: 'one_off', time: '14:10', date: '2026-10-14', intervalDays: null, weekdays: [], endsOn: null })
  })

  test('later keeps date and time', () => {
    const draft = { ...blankDraft(NOW), when: 'later' as const, laterDate: '2026-10-16', time: '10:00' }
    expect(draftToInput(draft, NOW).schedule).toMatchObject({ kind: 'one_off', date: '2026-10-16', time: '10:00' })
  })

  test('round-trips a saved campaign', () => {
    const item = {
      id: 'c1', name: 'Friday', messageTemplate: 'Hi', audience: { minOrderCount: 3 },
      schedule: { kind: 'every_n_days', time: '09:00', date: null, intervalDays: 7, weekdays: [], endsOn: '2026-12-01' },
    } as unknown as CampaignListItem
    const draft = draftFromItem(item, NOW)
    expect(draft).toMatchObject({ id: 'c1', when: 'repeat', repeatKind: 'every_n_days', intervalDays: 7, endsOn: '2026-12-01' })
    expect(draftToInput(draft, NOW)).toEqual({
      id: 'c1', name: 'Friday', messageTemplate: 'Hi', audience: { minOrderCount: 3 },
      schedule: { kind: 'every_n_days', time: '09:00', date: null, intervalDays: 7, weekdays: [], endsOn: '2026-12-01' },
    })
  })

  test('dirty when anything changed', () => {
    const draft = blankDraft(NOW)
    expect(isDraftDirty(draft, draft)).toBe(false)
    expect(isDraftDirty(draft, { ...draft, name: 'X' })).toBe(true)
  })
})

describe('validation', () => {
  test('name', () => {
    expect(nameProblem('')).toBe('Give it a name only you will see.')
    expect(nameProblem('x'.repeat(61))).toBe('Keep the name under 60 characters.')
  })

  test('later in the past', () => {
    const draft = { ...blankDraft(NOW), when: 'later' as const, laterDate: '2026-10-14', time: '09:00' }
    expect(whenProblem(draft, NOW)).toBe('Pick a time from now on.')
  })

  test('repeat end date: required, not past, at most 6 months', () => {
    const base = { ...blankDraft(NOW), when: 'repeat' as const }
    expect(whenProblem({ ...base, endsOn: '' }, NOW)).toBe('Pick the day it stops.')
    expect(whenProblem({ ...base, endsOn: '2026-10-13' }, NOW)).toBe('Pick a stop day from today on.')
    expect(whenProblem({ ...base, endsOn: '2027-06-01' }, NOW)).toBe(`Stop it within 6 months (by ${'Apr 12'}).`)
    expect(MAX_REPEAT_DAYS).toBe(180)
  })

  test('weekly needs a day', () => {
    const draft = { ...blankDraft(NOW), when: 'repeat' as const, repeatKind: 'weekly' as const, weekdays: [] }
    expect(whenProblem(draft, NOW)).toBe('Pick at least one day.')
  })

  test('quiet-hours note', () => {
    expect(quietNote('22:00', RULES)).toBe("That's during quiet hours (9pm–8am). It will start at 8:00 AM instead.")
    expect(quietNote('10:00', RULES)).toBeNull()
  })
})
