/**
 * The order summary contract every checkout design has to keep.
 *
 * Four of the five designs delegate their summary to the shared
 * `OrderSummaryLines` primitive. `classic` — the DEFAULT, and what the large
 * majority of tenants actually serve — hand-rolled its own, and so silently
 * dropped rows the primitive had grown:
 *
 *   - the Subtotal row (the customer could not see what the food cost before
 *     the delivery fee and service charge were added), and
 *   - the delivery-fee error (a refused quote showed a bare "—" and no reason).
 *
 * These are rendered assertions, parameterised over the registry, precisely so
 * that the next design cannot regress the same way by copying markup instead of
 * composing the primitive.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { ClassicCheckout } from '@/components/customer/checkout-templates/classic-checkout'
import { ModernCheckout } from '@/components/customer/checkout-templates/modern-checkout'
import { MinimalCheckout } from '@/components/customer/checkout-templates/minimal-checkout'
import { WizardCheckout } from '@/components/customer/checkout-templates/wizard-checkout'
import { ExpressCheckout } from '@/components/customer/checkout-templates/express-checkout'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

const SUBTOTAL = 200
const DELIVERY_FEE = 50
const DELIVERY_FEE_ERROR = 'We could not calculate a delivery fee for that address.'

type CheckoutDesign = (props: { checkout: UseCheckoutReturn }) => React.ReactNode

/**
 * The registry, as designs. `index.tsx` maps ids onto next/dynamic wrappers
 * which never resolve under jsdom, so the components are named directly here —
 * the list must stay in step with `getCheckoutTemplateComponent`.
 */
const DESIGNS: ReadonlyArray<readonly [string, CheckoutDesign]> = [
  ['classic', ClassicCheckout],
  ['modern', ModernCheckout],
  ['minimal', MinimalCheckout],
  ['wizard', WizardCheckout],
  ['express', ExpressCheckout],
]

function makeCheckout(overrides: Partial<UseCheckoutReturn> = {}): UseCheckoutReturn {
  return {
    router: { push: jest.fn(), back: jest.fn() },
    tenant: { id: 'tenant-1', name: 'Island Silog' },
    branding: {},
    orderTypes: [],
    orderType: '',
    setOrderType: jest.fn(),
    selectedOrderTypeData: null,
    shouldAskFulfillment: false,
    advanceConfig: { enabled: false, allowAsap: true, leadTimeMinutes: 0 },
    scheduleMode: 'asap',
    setScheduleMode: jest.fn(),
    scheduleDate: '',
    scheduleTime: '',
    setScheduleTime: jest.fn(),
    scheduleDates: [],
    timeSlots: [],
    scheduledForLabel: null,
    handleScheduleDateChange: jest.fn(),
    formFields: [],
    customerData: {},
    setCustomerData: jest.fn(),
    items: [
      {
        id: 'line-1',
        menu_item: { name: 'Latte' },
        quantity: 2,
        subtotal: SUBTOTAL,
        selected_variation: null,
        selected_variations: [],
        selected_addons: [],
      },
    ],
    total: SUBTOTAL,
    deliveryFee: DELIVERY_FEE,
    isFetchingDeliveryFee: false,
    deliveryFeeAddress: null,
    deliveryFeeError: null,
    serviceChargeAmount: 0,
    grandTotal: SUBTOTAL + DELIVERY_FEE,
    paymentMethods: [],
    selectedPaymentMethod: null,
    setSelectedPaymentMethod: jest.fn(),
    openQrDialog: jest.fn(),
    handleCopyText: jest.fn(),
    copiedText: null,
    isProcessing: false,
    handleProceedToPayment: jest.fn(),
    messengerEnabled: true,
    orderMinimum: { meets: true, minimum: 0, shortfall: 0 },
    voucherCodes: [],
    voucherPreview: null,
    isCheckingVoucher: false,
    applyVoucherCode: jest.fn(),
    removeVoucherCode: jest.fn(),
    ...overrides,
  } as unknown as UseCheckoutReturn
}

/**
 * Render a design with its summary on screen. The wizard puts the summary on
 * its final "Review" screen, so it is walked there; every other design shows it
 * on first paint.
 */
function renderWithSummary(Design: CheckoutDesign, checkout: UseCheckoutReturn) {
  render(<Design checkout={checkout} />)

  for (let guard = 0; guard < 5; guard += 1) {
    if (screen.queryByText('Subtotal')) return
    const next = screen.queryByRole('button', { name: /^continue$/i })
    if (!next) return
    fireEvent.click(next)
  }
}

/** The whole row a labelled summary line renders, label and figure together. */
function summaryRowText(label: string): string {
  const labelElement = screen.getByText(label)
  return labelElement.parentElement?.textContent ?? ''
}

describe.each(DESIGNS)('%s checkout order summary', (_name, Design) => {
  it('shows the subtotal before fees are added', () => {
    renderWithSummary(Design, makeCheckout())

    expect(screen.getByText('Subtotal')).toBeInTheDocument()
    expect(summaryRowText('Subtotal')).toContain('₱200.00')
  })

  it('tells the customer when the delivery fee could not be quoted', () => {
    renderWithSummary(
      Design,
      makeCheckout({
        deliveryFee: null,
        isFetchingDeliveryFee: false,
        deliveryFeeError: DELIVERY_FEE_ERROR,
        grandTotal: SUBTOTAL,
      }),
    )

    expect(screen.getByText(DELIVERY_FEE_ERROR)).toBeInTheDocument()
  })
})
