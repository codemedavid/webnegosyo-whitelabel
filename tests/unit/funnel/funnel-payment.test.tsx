/**
 * The funnel's payment step (inline after the order form, and the
 * /checkout/confirmation page): amount + reference, the chosen method with
 * its real logo, its QR on a white plate, copyable account number, and the
 * screenshot upload.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CheckoutLeadConfirmation } from '@/lib/checkout-leads/confirmation'

const submitPaymentProof = jest.fn<(...args: unknown[]) => Promise<{ error: string | null }>>()
const uploadPaymentProofImage = jest.fn<(...args: unknown[]) => Promise<{ url: string }>>()

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@/lib/meta-pixel', () => ({ trackMetaEvent: jest.fn() }))
jest.mock('@/app/actions/checkout-leads', () => ({
  submitPaymentProof: (...args: unknown[]) => submitPaymentProof(...args),
}))
jest.mock('@/lib/imagekit-upload', () => ({
  isImageKitConfigured: () => true,
  uploadPaymentProofImage: (...args: unknown[]) => uploadPaymentProofImage(...args),
}))

const GCASH_LEAD: CheckoutLeadConfirmation = {
  reference_number: 'WN-20261105-ABCDEFGH',
  amount: 5499,
  payment_term: 'six_month_full',
  payment_proof_url: null,
  platform_payment_methods: {
    name: 'Gcash',
    details: 'John Angelo David\n09928214519',
    qr_code_url: 'https://media.webnegosyo.com/platform-payment-qr/gcash.png',
  },
}

async function renderPayment(lead: CheckoutLeadConfirmation) {
  // next/jest leaves static imports ahead of jest.mock, so load lazily.
  const { FunnelPayment } = await import('@/components/funnel/funnel-payment')
  return render(<FunnelPayment lead={lead} />)
}

describe('FunnelPayment', () => {
  beforeEach(() => {
    submitPaymentProof.mockReset()
    uploadPaymentProofImage.mockReset()
  })

  it('shows what to pay, the reference and where to send it', async () => {
    await renderPayment(GCASH_LEAD)

    expect(screen.getAllByText('₱5,499').length).toBeGreaterThan(0)
    expect(screen.getByText('WN-20261105-ABCDEFGH')).toBeTruthy()
    expect(screen.getByAltText('GCash').getAttribute('src')).toBe('/payments/gcash.svg')
    expect(screen.getByAltText(/gcash qr code/i).getAttribute('src')).toBe(GCASH_LEAD.platform_payment_methods?.qr_code_url)
    expect(screen.getByText('John Angelo David')).toBeTruthy()
    expect(screen.getByText('09928214519')).toBeTruthy()
  })

  it('copies the account number with one tap', async () => {
    const user = userEvent.setup()
    await renderPayment(GCASH_LEAD)

    await user.click(screen.getByRole('button', { name: /copy gcash number/i }))

    expect(await navigator.clipboard.readText()).toBe('09928214519')
  })

  it('shows what is still owed on the ₱999-a-month plan', async () => {
    await renderPayment({ ...GCASH_LEAD, amount: 999, payment_term: 'six_month_installment' })

    expect(screen.getAllByText('₱999').length).toBeGreaterThan(0)
    expect(screen.getByText('₱4,995')).toBeTruthy()
  })

  it('shows the balance still owed on an older downpayment lead', async () => {
    await renderPayment({ ...GCASH_LEAD, amount: 2000, payment_term: 'six_month_downpayment' })

    expect(screen.getAllByText('₱2,000').length).toBeGreaterThan(0)
    expect(screen.getByText('₱3,499')).toBeTruthy()
  })

  it('shows a bank without a QR as account details only', async () => {
    await renderPayment({
      ...GCASH_LEAD,
      platform_payment_methods: { name: 'BPI', details: 'John Angelo David\n0656982775', qr_code_url: null },
    })

    expect(screen.getByAltText('BPI').getAttribute('src')).toBe('/payments/bpi.svg')
    expect(screen.queryByAltText(/qr code/i)).toBeNull()
    expect(screen.getByRole('button', { name: /copy account number/i })).toBeTruthy()
  })

  it('uploads the screenshot against the reference number', async () => {
    uploadPaymentProofImage.mockResolvedValue({ url: 'https://media.webnegosyo.com/payment-proofs/p.png' })
    submitPaymentProof.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    await renderPayment(GCASH_LEAD)

    const file = new File(['png'], 'proof.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Upload payment screenshot'), file)

    await waitFor(() =>
      expect(submitPaymentProof).toHaveBeenCalledWith(
        'WN-20261105-ABCDEFGH',
        'https://media.webnegosyo.com/payment-proofs/p.png'
      )
    )
    expect(await screen.findByText(/natanggap na namin ang screenshot/i)).toBeTruthy()
  })

  it('remembers a screenshot that was already uploaded', async () => {
    await renderPayment({ ...GCASH_LEAD, payment_proof_url: 'https://media.webnegosyo.com/payment-proofs/p.png' })

    expect(screen.getByText(/natanggap na namin ang screenshot/i)).toBeTruthy()
  })
})
