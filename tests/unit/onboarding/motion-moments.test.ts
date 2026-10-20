import { chapterBreakFor, pickedLabel } from '@/components/onboarding/motion/moments'
import { WIZARD_STEPS } from '@/components/onboarding/wizard-draft'

describe('onboarding motion moments', () => {
  test('celebrates finishing About you on the way into the store chapter', () => {
    const moment = chapterBreakFor('plan', 'store', WIZARD_STEPS)
    expect(moment).toMatchObject({ doneLabel: 'About you', headline: "Now let's build your store" })
  })

  test('celebrates finishing the store chapter before the password', () => {
    expect(chapterBreakFor('bestsellers', 'account', WIZARD_STEPS)?.doneLabel).toBe('Your store')
  })

  test('stays quiet inside a chapter, going back, and leaving the welcome screen', () => {
    expect(chapterBreakFor('goals', 'channels', WIZARD_STEPS)).toBeNull()
    expect(chapterBreakFor('store', 'plan', WIZARD_STEPS)).toBeNull()
    expect(chapterBreakFor('welcome', 'goals', WIZARD_STEPS)).toBeNull()
  })

  test('counts multi-select picks', () => {
    expect(pickedLabel(0)).toBe('Pick as many as you like')
    expect(pickedLabel(2)).toBe('2 picked')
  })
})
