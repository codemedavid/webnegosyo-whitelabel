import { draftToAnswers, emptyDraft, restoreDraft, stepBlocker, type WizardDraft } from '@/components/onboarding/wizard-draft'

const filled = (): WizardDraft => ({
  ...emptyDraft("Juan's Kitchen"),
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

  test('ordering step needs a way to pay and a wallet name', () => {
    expect(stepBlocker('ordering', { ...filled(), acceptsCash: false, gcashNumber: '' }, 0)).toBe('Pick at least one way to pay')
    expect(stepBlocker('ordering', { ...filled(), gcashName: '' }, 0)).toBe('Enter the GCash account name')
    expect(stepBlocker('ordering', { ...filled(), orderTypes: [] }, 0)).toBe('Pick at least one way to order')
  })
})

describe('restoreDraft', () => {
  test('restores a well-formed saved draft over the fallback', () => {
    // Arrange
    const saved = { ...filled(), tagline: 'Home-style cooking', closedDays: [0, 6] }

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
      tagline: 'kept',
      unknownField: true,
    }

    // Act
    const restored = restoreDraft(fallback, saved)

    // Assert
    expect(restored).toEqual({ ...fallback, tagline: 'kept' })
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

  test('welcome and brand never block', () => {
    expect(stepBlocker('welcome', filled(), 0)).toBeNull()
    expect(stepBlocker('brand', filled(), 0)).toBeNull()
  })
})
