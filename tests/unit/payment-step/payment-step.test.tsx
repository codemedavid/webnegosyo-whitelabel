/**
 * The checkout payment step (`PaymentStep`): every layout and every upload
 * design keeps the money rule (Send waits for proof on a method that asks for
 * it), the upload is gone for methods that never ask, the page-like layouts
 * answer the phone's Back button, and a preview never sends an order.
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import { PaymentStep } from '@/components/customer/checkout-templates/payment-step'
import { previewPaymentMethod, SAMPLE_PAYMENT_METHOD } from '@/components/customer/checkout-templates/payment-step-state'
import { buildSampleCheckout } from '@/components/page-designer/checkout/sample-checkout'
import { readPaymentStepStyle, type PaymentStepLayout, type PaymentUploadDesign } from '@/lib/payment-step/style'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { PaymentMethod } from '@/types/database'

jest.mock('@/lib/imagekit-upload', () => ({
  isImageKitConfigured: () => true,
  uploadImageToImageKit: jest.fn(),
  uploadPaymentProofImage: jest.fn(),
}))

jest.mock('sonner', () => ({ toast: { info: jest.fn(), error: jest.fn() } }))

const LAYOUTS: PaymentStepLayout[] = ['sheet', 'popup', 'fullscreen', 'screen']
const DESIGNS: PaymentUploadDesign[] = ['classic', 'button', 'steps', 'compact', 'reference']

const PROOF_METHOD = { ...SAMPLE_PAYMENT_METHOD, id: 'gcash', require_payment_proof: true } as PaymentMethod
const PLAIN_METHOD = { ...SAMPLE_PAYMENT_METHOD, id: 'bank', require_payment_proof: false } as PaymentMethod

function makeCheckout(overrides: Partial<Record<string, unknown>> = {}) {
  const handlers = {
    handleCheckout: jest.fn(async () => undefined),
    handleQrHandoff: jest.fn(),
    setShowPaymentDetails: jest.fn(),
    setPaymentProofReference: jest.fn(),
  }
  const checkout = {
    ...buildSampleCheckout(null),
    paymentProofUrl: '',
    paymentProofReference: '',
    handlePaymentProofUploaded: jest.fn(),
    handleRemovePaymentProof: jest.fn(),
    ...handlers,
    ...overrides,
  } as unknown as UseCheckoutReturn
  return { checkout, ...handlers }
}

const style = (raw: Record<string, unknown> = {}) => readPaymentStepStyle({ payment_step_style: raw })

function findSend(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector('[data-branding-scope="payment/send"]')
  if (!button) throw new Error('no Send button')
  return button as HTMLButtonElement
}

beforeAll(() => {
  // jsdom has no scrolling; "Its own screen" starts at the top and restores afterwards.
  window.scrollTo = jest.fn() as unknown as typeof window.scrollTo
})

beforeEach(() => {
  window.history.replaceState(null, '')
})

describe('PaymentStep — proof of payment', () => {
  it('shows no upload at all for a method that does not ask for proof', () => {
    const { checkout } = makeCheckout()
    const { container } = render(<PaymentStep checkout={checkout} method={PLAIN_METHOD} style={style()} />)
    expect(container.querySelector('[aria-label="Proof of payment"]')).toBeNull()
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(findSend(container)).not.toBeDisabled()
  })

  it.each(LAYOUTS.flatMap((layout) => DESIGNS.map((design) => [layout, design] as const)))(
    '%s + %s: Send waits for a screenshot or reference on a method that asks for proof',
    (layout, design) => {
      const { checkout } = makeCheckout()
      const { container, rerender } = render(
        <PaymentStep checkout={checkout} method={PROOF_METHOD} style={style({ layout, upload_design: design })} />,
      )
      expect(container.querySelector(`[data-payment-step="${layout}"]`)).not.toBeNull()
      expect(container.querySelector(`[data-upload-design="${design}"]`)).not.toBeNull()
      // The iOS rule: the file input sits inside the visible label, never hidden.
      const input = container.querySelector('input[type="file"]')
      expect(input?.closest('label')).not.toBeNull()
      expect(input).not.toHaveClass('hidden')
      expect(input).not.toHaveClass('sr-only')
      expect(findSend(container)).toBeDisabled()

      rerender(
        <PaymentStep
          checkout={{ ...checkout, paymentProofReference: '0091234' } as UseCheckoutReturn}
          method={PROOF_METHOD}
          style={style({ layout, upload_design: design })}
        />,
      )
      expect(findSend(container)).not.toBeDisabled()
    },
  )

  it('types the reference through the hook in every design', () => {
    for (const design of DESIGNS) {
      const { checkout, setPaymentProofReference } = makeCheckout()
      const { unmount } = render(<PaymentStep checkout={checkout} method={PROOF_METHOD} style={style({ upload_design: design })} />)
      fireEvent.change(screen.getByLabelText(/reference/i), { target: { value: '42' } })
      expect(setPaymentProofReference).toHaveBeenCalledWith('42')
      unmount()
    }
  })

  it('shows the owner’s example receipt behind "See an example"', () => {
    const { checkout } = makeCheckout()
    render(<PaymentStep checkout={checkout} method={PROOF_METHOD} style={style({ sample_image: 'https://ik.imagekit.io/x/r.jpg' })} />)
    expect(screen.getByText('See an example')).toBeInTheDocument()
    expect(screen.getByAltText('Example payment receipt')).toHaveAttribute('src', 'https://ik.imagekit.io/x/r.jpg')
  })
})

describe('PaymentStep — layouts', () => {
  it('the default is the bottom sheet, unchanged', () => {
    const { checkout } = makeCheckout()
    const { container } = render(<PaymentStep checkout={checkout} method={PROOF_METHOD} style={style()} />)
    const panel = container.querySelector('[data-payment-step="sheet"]')
    expect(panel).toHaveClass('rounded-t-3xl')
    expect(panel?.getAttribute('role')).toBe('dialog')
  })

  it('the sheet leaves the browser history alone', () => {
    const { checkout } = makeCheckout()
    const push = jest.spyOn(window.history, 'pushState')
    render(<PaymentStep checkout={checkout} method={PROOF_METHOD} style={style({ layout: 'sheet' })} />)
    expect(push).not.toHaveBeenCalled()
    push.mockRestore()
  })

  it.each(['fullscreen', 'screen'] as const)('%s: the phone’s Back button closes the step', (layout) => {
    const { checkout, setShowPaymentDetails } = makeCheckout()
    render(<PaymentStep checkout={checkout} method={PROOF_METHOD} style={style({ layout })} />)
    expect((window.history.state as Record<string, unknown>)?.wnPaymentStep).toBe(true)

    act(() => {
      window.history.replaceState(null, '')
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })
    expect(setShowPaymentDetails).toHaveBeenCalledWith(false)
  })

  it.each(['fullscreen', 'screen'] as const)('%s: the in-step back button pops the entry it pushed', (layout) => {
    const { checkout } = makeCheckout()
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => undefined)
    render(<PaymentStep checkout={checkout} method={PROOF_METHOD} style={style({ layout })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to checkout', hidden: true }))
    expect(back).toHaveBeenCalledTimes(1)
    back.mockRestore()
  })

  it('Back while the order is being sent keeps the step open', () => {
    const { checkout, setShowPaymentDetails } = makeCheckout({ isProcessing: true })
    render(<PaymentStep checkout={checkout} method={PROOF_METHOD} style={style({ layout: 'screen' })} />)
    act(() => {
      window.history.replaceState(null, '')
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })
    expect(setShowPaymentDetails).not.toHaveBeenCalled()
    expect((window.history.state as Record<string, unknown>)?.wnPaymentStep).toBe(true)
  })
})

describe('PaymentStep — preview', () => {
  it('never sends an order, uploads nothing and touches no history', () => {
    const { checkout, handleCheckout, handleQrHandoff } = makeCheckout({ paymentProofReference: '0091' })
    const push = jest.spyOn(window.history, 'pushState')
    const { container } = render(<PaymentStep checkout={checkout} method={PROOF_METHOD} style={style({ layout: 'screen' })} isPreview />)
    fireEvent.click(findSend(container))
    expect(handleCheckout).not.toHaveBeenCalled()
    expect(handleQrHandoff).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    push.mockRestore()
  })

  it('holds the step open on a method that asks for proof', () => {
    const cash = { ...PLAIN_METHOD, id: 'cash', skip_payment_details: true } as PaymentMethod
    expect(previewPaymentMethod([cash, PLAIN_METHOD], 'cash')).toMatchObject({ id: 'bank', require_payment_proof: true })
    expect(previewPaymentMethod([cash], 'cash')).toMatchObject({ id: SAMPLE_PAYMENT_METHOD.id, require_payment_proof: true })
  })
})
