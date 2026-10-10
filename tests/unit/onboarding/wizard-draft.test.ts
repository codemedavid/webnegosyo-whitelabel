import {
  WIZARD_STEPS,
  chapterOf,
  draftToAnswers,
  emptyDraft,
  firstUnansweredStep,
  restoreDraft,
  stepBlocker,
  toggleChannel,
  wizardProgress,
  type WizardDraft,
} from '@/components/onboarding/wizard-draft'

const filled = (): WizardDraft => ({
  ...emptyDraft("Juan's Kitchen"),
  goals: ['regulars', 'bigger_orders'],
  channels: ['walk_in', 'facebook'],
  dailyOrders: '10_30',
  typicalOrder: '100_200',
  storeType: 'restaurant',
  bestSellers: ['Chicken Adobo', '', 'Halo-halo'],
  gcashNumber: '0917 123 4567',
  gcashName: 'Juan dela Cruz',
})

describe('draftToAnswers', () => {
  test('maps a filled draft to valid answers', () => {
    // Act
    const result = draftToAnswers(filled())

    // Assert
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.answers.bestSellers).toEqual(['Chicken Adobo', 'Halo-halo'])
    expect(result.answers.payments.gcash).toEqual({ number: '09171234567', accountName: 'Juan dela Cruz' })
    expect(result.answers.payments.maya).toBeNull()
    expect(result.answers.hours).toEqual({ open: '09:00', close: '21:00', closedDays: [], stopOrdersWhenClosed: true })
    // Goals come back in their listed order, whatever order they were tapped in.
    expect(result.answers.goals).toEqual(['bigger_orders', 'regulars'])
    expect(result.answers.channels).toEqual(['walk_in', 'facebook'])
    expect(result.answers.dailyOrders).toBe('10_30')
    expect(result.answers.typicalOrder).toBe('100_200')
  })

  test('reports the first problem in plain words', () => {
    // Act
    const result = draftToAnswers({ ...filled(), gcashNumber: '12345' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Enter an 11-digit mobile number like 0917 123 4567' })
  })
})

describe('stepBlocker', () => {
  test('store step needs a name and a type', () => {
    expect(stepBlocker('store', { ...filled(), storeType: '' }, 0)).toBe('Pick what kind of store you run')
    expect(stepBlocker('store', filled(), 0)).toBeNull()
  })

  test('menu step accepts a photo or typed text', () => {
    expect(stepBlocker('menu', filled(), 0)).toBe('Add a photo of your menu, or type it in')
    expect(stepBlocker('menu', filled(), 1)).toBeNull()
    expect(stepBlocker('menu', { ...filled(), menuText: 'Adobo 150' }, 0)).toBeNull()
  })

  test('ordering needs a way to order; payments need a way to pay and a wallet name', () => {
    expect(stepBlocker('payments', { ...filled(), acceptsCash: false, gcashNumber: '' }, 0)).toBe('Pick at least one way to pay')
    expect(stepBlocker('payments', { ...filled(), gcashName: '' }, 0)).toBe('Enter the GCash account name')
    expect(stepBlocker('ordering', { ...filled(), orderTypes: [] }, 0)).toBe('Pick at least one way to order')
    expect(stepBlocker('ordering', filled(), 0)).toBeNull()
  })

  test('the about-you questions each need an answer', () => {
    expect(stepBlocker('goals', { ...filled(), goals: [] }, 0)).toBe('Pick at least one')
    expect(stepBlocker('channels', { ...filled(), channels: [] }, 0)).toBe('Pick at least one')
    expect(stepBlocker('daily', { ...filled(), dailyOrders: '' }, 0)).toBe('Pick the closest one')
    expect(stepBlocker('typical', { ...filled(), typicalOrder: '' }, 0)).toBe('Pick the closest one')
    expect(['goals', 'channels', 'daily', 'typical', 'plan'].map((step) => stepBlocker(step as never, filled(), 0))).toEqual([null, null, null, null, null])
  })
})

describe('restoreDraft', () => {
  test('restores a well-formed saved draft over the fallback', () => {
    // Arrange
    const saved = { ...filled(), closedDays: [0, 6] }

    // Act
    const restored = restoreDraft(emptyDraft('Store'), JSON.parse(JSON.stringify(saved)))

    // Assert
    expect(restored).toEqual(saved)
  })

  test('drops fields whose shape no longer matches instead of crashing the form', () => {
    // Arrange
    const fallback = emptyDraft('Store')
    const saved = {
      storeName: 42,
      storeType: 'spaceship',
      bestSellers: ['only one'],
      orderTypes: ['pickup', 'teleport'],
      closedDays: [1, 9],
      acceptsCash: 'yes',
      goals: ['regulars', 'world_peace'],
      channels: 'facebook',
      dailyOrders: 'lots',
      storeName2: 'kept?',
      menuText: 'kept',
      unknownField: true,
    }

    // Act
    const restored = restoreDraft(fallback, saved)

    // Assert
    expect(restored).toEqual({ ...fallback, menuText: 'kept' })
  })

  test('ignores a saved value that is not an object', () => {
    const fallback = emptyDraft('Store')
    expect(restoreDraft(fallback, null)).toBe(fallback)
    expect(restoreDraft(fallback, 'draft')).toBe(fallback)
    expect(restoreDraft(fallback, [1, 2])).toBe(fallback)
  })
})

describe('brand color in the draft', () => {
  test('a picked color travels with the answers', () => {
    // Act
    const result = draftToAnswers({ ...filled(), brandColor: '#7B4A2D' })

    // Assert
    expect(result.ok && result.answers.brandColor).toBe('#7b4a2d')
  })

  test('no pick leaves the color to the logo', () => {
    // Act
    const result = draftToAnswers({ ...filled(), brandColor: '' })

    // Assert
    expect(result.ok && result.answers.brandColor).toBeNull()
  })

  test('a malformed saved color is dropped on restore', () => {
    expect(restoreDraft(filled(), { brandColor: 'url(x)' }).brandColor).toBe('')
    expect(restoreDraft(filled(), { brandColor: '#123abc' }).brandColor).toBe('#123abc')
  })
})

describe('hours that cross midnight', () => {
  test('are refused up front instead of silently falling back to default hours', () => {
    expect(stepBlocker('hours', { ...filled(), open: '16:00', close: '02:00' }, 0)).toBe('Closing time must be later than opening time (same day)')
    expect(draftToAnswers({ ...filled(), open: '16:00', close: '02:00' })).toEqual({ ok: false, error: 'Closing time must be later than opening time (same day)' })
  })

  test('welcome, brand, best sellers and the plan never block', () => {
    expect(stepBlocker('welcome', filled(), 0)).toBeNull()
    expect(stepBlocker('brand', filled(), 0)).toBeNull()
    expect(stepBlocker('bestsellers', { ...filled(), bestSellers: ['', '', ''] }, 0)).toBeNull()
    expect(stepBlocker('plan', filled(), 0)).toBeNull()
  })
})

describe('chapters and progress', () => {
  test('every question belongs to exactly one of three chapters', () => {
    const questions = WIZARD_STEPS.filter((step) => step !== 'welcome')
    expect(questions.every((step) => chapterOf(step) !== null)).toBe(true)
    expect(chapterOf('goals')?.label).toBe('About you')
    expect(chapterOf('bestsellers')?.label).toBe('Your store')
    expect(chapterOf('account')?.label).toBe('Go live')
  })

  test('the bar starts part-filled (they already paid) and only moves forward', () => {
    const shares = WIZARD_STEPS.map(wizardProgress)
    expect(shares[1]).toBeGreaterThan(0)
    expect(shares.slice(1).every((share, index, all) => index === 0 || share > all[index - 1])).toBe(true)
    expect(Math.max(...shares)).toBeLessThan(1)
  })

  test('a reload resumes at the first question still unanswered', () => {
    expect(firstUnansweredStep(emptyDraft('Store'), 0)).toBe('goals')
    expect(firstUnansweredStep({ ...filled(), menuText: '' }, 0)).toBe('menu')
    expect(firstUnansweredStep(filled(), 1)).toBe('account')
  })
})

describe('toggleChannel', () => {
  test('"Not open yet" stands alone', () => {
    expect(toggleChannel(['walk_in', 'facebook'], 'not_open')).toEqual(['not_open'])
    expect(toggleChannel(['not_open'], 'facebook')).toEqual(['facebook'])
    expect(toggleChannel(['walk_in'], 'walk_in')).toEqual([])
  })
})

describe('toggleBestSeller', () => {
  test('fills the next free slot, never a fourth, and taps off again', async () => {
    const { toggleBestSeller } = await import('@/components/onboarding/wizard-draft')
    expect(toggleBestSeller(['', '', ''], 'Adobo')).toEqual(['Adobo', '', ''])
    expect(toggleBestSeller(['Adobo', '', 'Sisig'], 'Halo-halo')).toEqual(['Adobo', 'Sisig', 'Halo-halo'])
    expect(toggleBestSeller(['Adobo', 'Sisig', 'Halo-halo'], 'Pancit')).toEqual(['Adobo', 'Sisig', 'Halo-halo'])
    expect(toggleBestSeller(['Adobo', 'Sisig', 'Halo-halo'], ' sisig ')).toEqual(['Adobo', 'Halo-halo', ''])
  })
})
