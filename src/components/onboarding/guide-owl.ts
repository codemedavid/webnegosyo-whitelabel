import type { OwlState } from '@/components/mascot/owl-markup'
import type { WizardStep } from '@/lib/onboarding/wizard-steps'

interface GuideMoment {
  isSubmitting: boolean
  isUploadingMenu: boolean
}

/** Steps where Owl reacts; every other step he simply rests beside the question. */
const STEP_MOODS: Partial<Record<WizardStep, OwlState>> = {
  welcome: 'happy',
  plan: 'happy',
  menu: 'waiting',
  account: 'waiting',
}

/** What Owl, the set-up guide, is doing on a wizard step. */
export function guideOwlState(step: WizardStep, { isSubmitting, isUploadingMenu }: GuideMoment): OwlState {
  if (isSubmitting || (step === 'menu' && isUploadingMenu)) return 'thinking'
  return STEP_MOODS[step] ?? 'idle'
}
