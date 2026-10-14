import { WIZARD_STEPS } from '@/lib/onboarding/wizard-steps'
import { OWL_STATES } from '@/components/mascot/owl-markup'
import { guideOwlState } from '@/components/onboarding/guide-owl'

const calm = { isSubmitting: false, isUploadingMenu: false }

describe('guideOwlState', () => {
  it.each(WIZARD_STEPS)('gives the %s step a real owl state', (step) => {
    expect(OWL_STATES).toContain(guideOwlState(step, calm))
  })

  it('greets the owner on the welcome screen', () => {
    expect(guideOwlState('welcome', calm)).toBe('happy')
  })

  it('cheers the launch plan', () => {
    expect(guideOwlState('plan', calm)).toBe('happy')
  })

  it('waits for the menu, then thinks while it uploads', () => {
    expect(guideOwlState('menu', calm)).toBe('waiting')
    expect(guideOwlState('menu', { ...calm, isUploadingMenu: true })).toBe('thinking')
  })

  it('thinks while the answers are being sent, whatever the step', () => {
    expect(guideOwlState('account', { ...calm, isSubmitting: true })).toBe('thinking')
  })

  it('rests on ordinary questions', () => {
    expect(guideOwlState('hours', calm)).toBe('idle')
  })
})
