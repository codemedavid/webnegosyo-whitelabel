/**
 * The funnel's payment step (inline after the order form, and the
 * /checkout/confirmation page): amount + reference, the chosen method with
 * its real logo, its QR on a white plate, copyable account number, and the
 * screenshot upload, then the thank-you screen once the screenshot is saved.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CheckoutLeadConfirmation } from '@/lib/checkout-leads/confirmation'

const submitPaymentProof = jest.fn<(...args: unknown[]) => Promise<{ error: string | null }>>()
const uploadPaymentProofImage = jest.fn<(...args: unknown[]) => Promise<{ url: string }>>()
const trackMetaEvent = jest.fn<(...args: unknown[]) => void>()

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@/lib/meta-pixel', () => ({ trackMetaEvent: (...args: unknown[]) => trackMetaEvent(...args) }))
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
    trackMetaEvent.mockReset()
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

  it('uploads the screenshot against the reference number, then thanks the buyer', async () => {
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
    // The payment step is gone: nothing asks them to pay any more.
    const heading = await screen.findByRole('heading', { level: 1, name: /natanggap na namin ang screenshot/i })
    expect(document.activeElement).toBe(heading)
    expect(screen.queryByText(/bayaran ang/i)).toBeNull()
    expect(screen.queryByAltText(/gcash qr code/i)).toBeNull()
    // We review everything, then reach them by text AND email.
    expect(screen.getByText(/ire-review namin ang lahat/i)).toBeTruthy()
    expect(screen.getByText('Text')).toBeTruthy()
    expect(screen.getByText('Email')).toBeTruthy()
    expect(screen.getByAltText(/payment screenshot na na-upload mo/i).getAttribute('src')).toBe(
      'https://media.webnegosyo.com/payment-proofs/p.png'
    )
  })

  it('keeps the payment step when the screenshot could not be saved', async () => {
    uploadPaymentProofImage.mockResolvedValue({ url: 'https://media.webnegosyo.com/payment-proofs/p.png' })
    submitPaymentProof.mockResolvedValue({ error: 'Too many uploads. Please try again later.' })
    const user = userEvent.setup()
    await renderPayment(GCASH_LEAD)

    await user.upload(screen.getByLabelText('Upload payment screenshot'), new File(['png'], 'proof.png', { type: 'image/png' }))

    await waitFor(() => expect(submitPaymentProof).toHaveBeenCalled())
    expect(screen.queryByText(/natanggap na namin ang screenshot/i)).toBeNull()
    expect(screen.getByLabelText('Upload payment screenshot')).toBeTruthy()
  })

  it('opens on the thank-you screen when a screenshot is already on file', async () => {
    await renderPayment({ ...GCASH_LEAD, payment_proof_url: 'https://media.webnegosyo.com/payment-proofs/p.png' })

    expect(screen.getByRole('heading', { level: 1, name: /natanggap na namin ang screenshot/i })).toBeTruthy()
    expect(screen.getByText('WN-20261105-ABCDEFGH')).toBeTruthy()
    expect(screen.queryByText(/bayaran ang/i)).toBeNull()
  })

  it('lets the buyer replace the screenshot, or change their mind', async () => {
    uploadPaymentProofImage.mockResolvedValue({ url: 'https://media.webnegosyo.com/payment-proofs/new.png' })
    submitPaymentProof.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    await renderPayment({ ...GCASH_LEAD, payment_proof_url: 'https://media.webnegosyo.com/payment-proofs/old.png' })

    await user.click(screen.getByRole('button', { name: /palitan/i }))
    expect(screen.getByLabelText('Upload payment screenshot')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /huwag nang palitan/i }))
    expect(screen.getByAltText(/payment screenshot na na-upload mo/i).getAttribute('src')).toContain('old.png')

    await user.click(screen.getByRole('button', { name: /palitan/i }))
    await user.upload(screen.getByLabelText('Upload payment screenshot'), new File(['png'], 'new.png', { type: 'image/png' }))

    expect((await screen.findByAltText(/payment screenshot na na-upload mo/i)).getAttribute('src')).toContain('new.png')
    expect(submitPaymentProof).toHaveBeenCalledWith('WN-20261105-ABCDEFGH', 'https://media.webnegosyo.com/payment-proofs/new.png')
  })

  it('never prints the buyer\'s phone or email (the page is public to the reference)', async () => {
    await renderPayment({ ...GCASH_LEAD, payment_proof_url: 'https://media.webnegosyo.com/payment-proofs/p.png' })

    expect(document.body.textContent).not.toMatch(/@|\b09\d{9}\b/)
  })

  it('marks the first screenshot as a Purchase, with the event id the server sends too', async () => {
    uploadPaymentProofImage.mockResolvedValue({ url: 'https://media.webnegosyo.com/payment-proofs/p.png' })
    submitPaymentProof.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    await renderPayment(GCASH_LEAD)

    await user.upload(screen.getByLabelText('Upload payment screenshot'), new File(['png'], 'proof.png', { type: 'image/png' }))
    await screen.findByRole('heading', { level: 1, name: /natanggap na namin ang screenshot/i })

    const purchases = trackMetaEvent.mock.calls.filter(([name]) => name === 'Purchase')
    expect(purchases).toEqual([
      [
        'Purchase',
        { content_name: 'Smart Menu System', currency: 'PHP', value: 5499, order_id: 'WN-20261105-ABCDEFGH' },
        'purchase_WN-20261105-ABCDEFGH',
      ],
    ])
  })

  it('fires no Purchase when the save failed, on a revisit, or for a replaced screenshot', async () => {
    uploadPaymentProofImage.mockResolvedValue({ url: 'https://media.webnegosyo.com/payment-proofs/p.png' })
    submitPaymentProof.mockResolvedValue({ error: 'Too many uploads. Please try again later.' })
    const user = userEvent.setup()
    const { unmount } = await renderPayment(GCASH_LEAD)
    await user.upload(screen.getByLabelText('Upload payment screenshot'), new File(['png'], 'proof.png', { type: 'image/png' }))
    await waitFor(() => expect(submitPaymentProof).toHaveBeenCalled())
    unmount()

    submitPaymentProof.mockResolvedValue({ error: null })
    await renderPayment({ ...GCASH_LEAD, payment_proof_url: 'https://media.webnegosyo.com/payment-proofs/old.png' })
    await user.click(screen.getByRole('button', { name: /palitan/i }))
    await user.upload(screen.getByLabelText('Upload payment screenshot'), new File(['png'], 'new.png', { type: 'image/png' }))
    await screen.findByRole('heading', { level: 1, name: /natanggap na namin ang screenshot/i })

    expect(trackMetaEvent.mock.calls.filter(([name]) => name === 'Purchase')).toEqual([])
  })
})
