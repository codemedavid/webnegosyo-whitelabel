/**
 * Voucher entry on the DEFAULT checkout design.
 *
 * The voucher engine, the server action that prices it and the shared
 * `VoucherField` all shipped and all work. On four of the five checkout designs
 * a customer can type a code. On `classic` they cannot — it predates the
 * template split and was kept "pixel-identical to the pre-checkout template",
 * so it hand-rolls its own order summary and never picked up the field that was
 * later added to the shared `OrderSummaryLines` primitive.
 *
 * `classic` is the default and 167 of the 175 tenants are on it, so in practice
 * a voucher cannot be redeemed online at all. Nothing is mis-priced — there is
 * simply nowhere to type the code.
 *
 * The guardrail below is the more important half. `checkout-primitives.tsx`
 * already carries the comment "Shared by all five designs, so a voucher works
 * the same everywhere", and that comment has been false since it was written.
 * A claim in a comment does not hold; a failing test does.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ClassicCheckout } from '@/components/customer/checkout-templates/classic-checkout'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { VoucherPreview } from '@/lib/vouchers/preview'

const CHECKOUT_TEMPLATE_DIR = 'src/components/customer/checkout-templates'

const TEMPLATES = [
  'classic',
  'modern',
  'minimal',
  'wizard',
  'express',
] as const

function readTemplate(name: string): string {
  return readFileSync(
    join(process.cwd(), `${CHECKOUT_TEMPLATE_DIR}/${name}-checkout.tsx`),
    'utf8',
  )
}

/**
 * A design offers voucher entry either by rendering the field itself or by
 * delegating its summary to `OrderSummaryLines`, which renders it. Both are
 * legitimate; rendering neither is the defect.
 */
function offersVoucherEntry(source: string): boolean {
  return /<VoucherField\b/.test(source) || /<OrderSummaryLines\b/.test(source)
}

// ---- Guardrail across every design ----------------------------------------

describe('every checkout design offers voucher entry', () => {
  it.each(TEMPLATES)('%s checkout lets a customer enter a code', (name) => {
    expect(offersVoucherEntry(readTemplate(name))).toBe(true)
  })
})

// ---- The default design, rendered ------------------------------------------

const ACCEPTED_PREVIEW: VoucherPreview = {
  accepted: [{ code: 'SAVE20', name: '20% off', description: null, amount: 40 }],
  rejected: [],
  discountTotal: 40,
  deliveryDiscount: 0,
}

const REJECTED_PREVIEW: VoucherPreview = {
  accepted: [],
  rejected: [
    { code: 'EXPIRED', reason: 'expired', message: 'That code has expired.' },
  ],
  discountTotal: 0,
  deliveryDiscount: 0,
}

function makeCheckout(overrides: Partial<UseCheckoutReturn> = {}): UseCheckoutReturn {
  return {
    router: { push: jest.fn(), back: jest.fn() },
    tenant: { id: 'tenant-1', name: 'Island Silog' },
    branding: {},
    orderTypes: [],
    orderType: '',
    setOrderType: jest.fn(),
    selectedOrderTypeData: null,
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
        subtotal: 200,
        selected_variation: null,
        selected_variations: [],
        selected_addons: [],
      },
    ],
    deliveryFee: null,
    isFetchingDeliveryFee: false,
    deliveryFeeAddress: null,
    serviceChargeAmount: 0,
    // Already net of any accepted voucher: `useCheckout` derives it through
    // `computeOrderTotals`, which is handed the discount lines.
    grandTotal: 200,
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
    // vouchers
    voucherCodes: [],
    voucherPreview: null,
    isCheckingVoucher: false,
    applyVoucherCode: jest.fn(),
    removeVoucherCode: jest.fn(),
    ...overrides,
  } as unknown as UseCheckoutReturn
}

describe('classic checkout voucher entry', () => {
  it('shows a customer somewhere to type a code', () => {
    render(<ClassicCheckout checkout={makeCheckout()} />)

    expect(screen.getByLabelText(/have a voucher/i)).toBeInTheDocument()
  })

  it('hands a typed code to the checkout hook', () => {
    const applyVoucherCode = jest.fn()
    render(<ClassicCheckout checkout={makeCheckout({ applyVoucherCode })} />)

    fireEvent.change(screen.getByLabelText(/have a voucher/i), {
      target: { value: 'SAVE20' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    expect(applyVoucherCode).toHaveBeenCalledWith('SAVE20')
  })

  it('shows what an accepted code took off', () => {
    render(
      <ClassicCheckout
        checkout={makeCheckout({
          voucherCodes: ['SAVE20'],
          voucherPreview: ACCEPTED_PREVIEW,
          grandTotal: 160,
        })}
      />,
    )

    expect(screen.getByText('SAVE20')).toBeInTheDocument()
    expect(screen.getByText(/−₱40\.00/)).toBeInTheDocument()
  })

  /**
   * A rejected code must say so on the code itself. With stacking one code can
   * be accepted while the next is turned down, and a single "invalid voucher"
   * banner would not say which.
   */
  it('tells the customer why a code was turned down', () => {
    render(
      <ClassicCheckout
        checkout={makeCheckout({
          voucherCodes: ['EXPIRED'],
          voucherPreview: REJECTED_PREVIEW,
        })}
      />,
    )

    expect(screen.getByText('That code has expired.')).toBeInTheDocument()
  })

  it('lets the customer take a code back off', () => {
    const removeVoucherCode = jest.fn()
    render(
      <ClassicCheckout
        checkout={makeCheckout({
          voucherCodes: ['SAVE20'],
          voucherPreview: ACCEPTED_PREVIEW,
          removeVoucherCode,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /remove voucher SAVE20/i }))

    expect(removeVoucherCode).toHaveBeenCalledWith('SAVE20')
  })

  /**
   * The total the customer is asked to pay must be the discounted one. Classic
   * reads `grandTotal`, which is already net — this pins that it keeps doing so
   * rather than re-adding the parts once a discount row is nearby.
   */
  it('shows the discounted total, not the full one', () => {
    render(
      <ClassicCheckout
        checkout={makeCheckout({
          voucherCodes: ['SAVE20'],
          voucherPreview: ACCEPTED_PREVIEW,
          grandTotal: 160,
        })}
      />,
    )

    expect(screen.getByText('₱160.00')).toBeInTheDocument()
  })
})
