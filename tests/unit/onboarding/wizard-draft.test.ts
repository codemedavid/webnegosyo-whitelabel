import { draftToAnswers, emptyDraft, stepBlocker, type WizardDraft } from '@/components/onboarding/wizard-draft'

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
