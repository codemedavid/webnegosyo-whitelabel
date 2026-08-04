/**
 * The screens the wizard checkout walks through, and nothing else.
 *
 * The wizard gives each question its own screen, so a question with no answer
 * to give cannot simply be hidden the way the single-page designs hide it: the
 * screen would still be counted, titled, and stepped onto, leaving the customer
 * looking at "How would you like to receive your order?" above nothing.
 *
 * Keeping the list here — rather than filtering at four separate render sites —
 * is what stops the wizard's numeric step index from pointing at a screen that
 * is not in the walk. Everything per-step is looked up BY NAME off this list.
 */

export const WIZARD_STEPS = ['Receive', 'Details', 'Payment', 'Review'] as const

export type WizardStep = (typeof WIZARD_STEPS)[number]

export interface WizardStepInput {
  /** From `shouldAskFulfillmentMethod` — see lib/checkout-fulfillment-choice. */
  shouldAskFulfillment: boolean
}

/** The walk for this checkout. Details, payment and review are never dropped. */
export function resolveWizardSteps({ shouldAskFulfillment }: WizardStepInput): WizardStep[] {
  return WIZARD_STEPS.filter((step) => step !== 'Receive' || shouldAskFulfillment)
}
