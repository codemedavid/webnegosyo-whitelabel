/**
 * Which screens the wizard checkout walks the customer through.
 *
 * The wizard gives each question a screen of its own, so "there is nothing to
 * ask" cannot be expressed by hiding the contents the way the single-page
 * designs do — that would leave a titled, empty screen with a Continue button
 * under it, which is worse than the question it replaced. The step has to stop
 * existing.
 *
 * Everything the wizard renders per step — title, subtitle, validity, the
 * panels themselves — is keyed off this list, so the list is the single place
 * that decides, and an index can never point at a step that is not there.
 */

import { resolveWizardSteps } from '@/lib/checkout-wizard-steps'

describe('wizard checkout steps', () => {
  it('walks all four screens when there is a fulfillment method to choose', () => {
    // Act
    const steps = resolveWizardSteps({ shouldAskFulfillment: true })

    // Assert
    expect(steps).toEqual(['Receive', 'Details', 'Payment', 'Review'])
  })

  it('drops the receive screen when there is nothing to receive-choose', () => {
    // Arrange: a dine-in-only merchant with no advance ordering.

    // Act
    const steps = resolveWizardSteps({ shouldAskFulfillment: false })

    // Assert
    expect(steps).toEqual(['Details', 'Payment', 'Review'])
  })

  it('never returns an empty walk', () => {
    // Assert: details, payment and review are always real questions.
    expect(resolveWizardSteps({ shouldAskFulfillment: false }).length).toBeGreaterThan(0)
  })
})
