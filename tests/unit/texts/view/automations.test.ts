import {
  automationCards,
  automationStatusLine,
  blockerFor,
  sheetChoices,
  turnOnQuestion,
  type Automation,
  type AutomationsView,
  type RecipeInfo,
} from '@/lib/texts/view/automations'

const recipe = (id: RecipeInfo['id'], overrides: Partial<RecipeInfo> = {}): RecipeInfo => ({
  id, moment: 'bring_back', title: id, pitch: 'p', defaults: {}, limits: {}, defaultReentryDays: 60,
  needsLoyalty: false, needsReviewLink: false, defaultMessage: 'Hi {{firstName}}', defaultMessageTl: 'Hi', variables: [],
  description: 'd', ...overrides,
})

const automation = (overrides: Partial<Automation> = {}): Automation => ({
  id: 'a1', recipe: 'win_back', name: 'We miss you', description: 'd', params: { inactiveDays: 30 }, messageTemplate: 'Hi',
  runMode: 'auto', reentryDays: null, status: 'on', source: 'owner', updatedAt: '',
  stats: { waiting: 0, sent30d: 0, skipped30d: 0, cameBack30d: 0, lastSentAt: null }, ...overrides,
})

const view = (overrides: Partial<AutomationsView> = {}): AutomationsView => ({
  automations: [],
  recipes: [recipe('review_request', { needsReviewLink: true }), recipe('win_back'), recipe('first_visit_followup')],
  settings: { quietHoursStart: '21:00', quietHoursEnd: '08:00', guestCapDays: 3, dailyLimit: 100, optOutLine: null, reviewUrl: null },
  sender: { enrolled: 1, online: true, lastSeenAt: null },
  outlook: { waiting: 0, sentToday: 0, dailyLimit: 100, finishAt: null },
  loyaltyOn: true,
  ...overrides,
})

describe('automatic texts (same words as the app)', () => {
  test('status line', () => {
    expect(automationStatusLine(automation({ status: 'off' }), view())).toBe('Off')
    expect(automationStatusLine(automation({ stats: { waiting: 3, sent30d: 41, skipped30d: 0, cameBack30d: 6, lastSentAt: null } }), view()))
      .toBe('On · 41 sent in 30 days · 6 ordered again · 3 waiting')
    expect(automationStatusLine(automation(), view({ sender: { enrolled: 0, online: false, lastSeenAt: null } }))).toBe('Waiting for a sending phone')
  })

  test('blockers', () => {
    expect(blockerFor('review_request', view())?.text).toBe('Add your review link to start')
  })

  test('cards: on first, then runnable, blocked last', () => {
    const cards = automationCards(view({ automations: [automation({ recipe: 'first_visit_followup', id: 'a2' })] }))
    expect(cards.map((c) => c.recipe.id)).toEqual(['first_visit_followup', 'win_back', 'review_request'])
    expect(cards[0].isOn).toBe(true)
    expect(cards[1].statusLine).toBe('Not set up')
  })

  test('turn-on dialog: safe choice first', () => {
    expect(turnOnQuestion(23)).toEqual({ title: '23 guests already qualify', body: 'Text them now too?' })
    const { choices } = sheetChoices({ mode: 'turn_on', queued: 23, hasSender: true, isOnline: true, runMode: 'auto' })
    expect(choices.map((c) => c.label)).toEqual(['Turn on for new guests only', 'Turn on and text 23 now'])
    expect(choices[0].sendBacklog).toBe(false)
  })
})
