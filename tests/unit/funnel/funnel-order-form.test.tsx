/**
 * The funnel's order form: a "yes" on the sales page becomes a checkout lead
 * on the plan the visitor picked (six months by default). The payment step is
 * built from the save's answer plus the methods already on screen, so the
 * buyer sees the QR the moment the lead is saved (no second page load).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const onSaved = jest.fn()
const submitCheckoutForm = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const fetchActivePlatformPaymentMethods = jest.fn<() => Promise<unknown>>()

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))
const trackMetaEvent = jest.fn()
jest.mock('@/lib/meta-pixel', () => ({
  createMetaEventId: () => 'evt-1',
  getMetaBrowserData: () => ({}),
  trackMetaEvent: (...args: unknown[]) => trackMetaEvent(...args),
}))
jest.mock('@/app/actions/checkout-leads', () => ({
  submitCheckoutForm: (...args: unknown[]) => submitCheckoutForm(...args),
  fetchActivePlatformPaymentMethods: () => fetchActivePlatformPaymentMethods(),
}))

const SUBMIT = /kunin ang 6-month plan/i

async function renderForm() {
  // next/jest leaves static imports ahead of jest.mock, so load lazily.
  const { FunnelOrderForm } = await import('@/components/funnel/funnel-order-form')
  return render(<FunnelOrderForm term="six_month_full" submitLabel="Kunin ang 6-month plan" onSaved={onSaved} />)
}

async function fillValidForm() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/your name/i), 'Juan dela Cruz')
  await user.type(screen.getByLabelText(/email/i), 'juan@example.com')
  await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
  await user.type(screen.getByLabelText(/business name/i), "Juan's Kitchen")
  return user
}

describe('FunnelOrderForm', () => {
  beforeEach(() => {
    onSaved.mockReset()
    submitCheckoutForm.mockReset()
    trackMetaEvent.mockReset()
    fetchActivePlatformPaymentMethods.mockResolvedValue([
      {
        id: 'pm-gcash',
        name: 'GCash',
        type: 'qr_code',
        details: 'John Angelo David\n09928214519',
        qr_code_url: 'https://media.webnegosyo.com/platform-payment-qr/gcash.png',
        is_active: true,
      },
    ])
  })

  it('creates a lead on the given term and hands back its payment step', async () => {
    submitCheckoutForm.mockResolvedValue({
      data: { reference_number: 'SM-123', amount: 5499 },
      error: null,
    })
    await renderForm()
    await waitFor(() => expect(fetchActivePlatformPaymentMethods).toHaveBeenCalled())

    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    await waitFor(() => expect(submitCheckoutForm).toHaveBeenCalledTimes(1))
    expect(submitCheckoutForm.mock.calls[0][0]).toMatchObject({
      name: 'Juan dela Cruz',
      business_name: "Juan's Kitchen",
      phone: '09171234567',
      selected_payment_method_id: 'pm-gcash',
      payment_term: 'six_month_full',
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved).toHaveBeenCalledWith({
      reference_number: 'SM-123',
      amount: 5499,
      payment_term: 'six_month_full',
      payment_proof_url: null,
      platform_payment_methods: {
        name: 'GCash',
        details: 'John Angelo David\n09928214519',
        qr_code_url: 'https://media.webnegosyo.com/platform-payment-qr/gcash.png',
      },
    })
  })

  it('takes the amount from the server, not from the page', async () => {
    submitCheckoutForm.mockResolvedValue({ data: { reference_number: 'SM-9', amount: 2000 }, error: null })
    await renderForm()
    await waitFor(() => expect(fetchActivePlatformPaymentMethods).toHaveBeenCalled())

    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect((onSaved.mock.calls[0][0] as { amount: number }).amount).toBe(2000)
  })

  it('shows the real logo on each payment choice and keeps its name for screen readers', async () => {
    await renderForm()
    const choice = await screen.findByLabelText('GCash')
    const label = choice.closest('label') as HTMLElement
    expect(label.querySelector('img')?.getAttribute('src')).toBe('/payments/gcash.svg')
  })

  it('stays pending after the lead is saved so a second tap cannot file a duplicate', async () => {
    submitCheckoutForm.mockResolvedValue({
      data: { reference_number: 'SM-123', amount: 5499 },
      error: null,
    })
    await renderForm()
    await waitFor(() => expect(fetchActivePlatformPaymentMethods).toHaveBeenCalled())

    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: SUBMIT }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    await user.click(button)
    expect(submitCheckoutForm).toHaveBeenCalledTimes(1)
  })

  it('re-arms the button when the lead is refused', async () => {
    submitCheckoutForm.mockResolvedValue({ data: null, error: 'Invalid payment term' })
    await renderForm()
    await waitFor(() => expect(fetchActivePlatformPaymentMethods).toHaveBeenCalled())

    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    await waitFor(() =>
      expect((screen.getByRole('button', { name: SUBMIT }) as HTMLButtonElement).disabled).toBe(false)
    )
  })

  it('says so when no payment method is available', async () => {
    fetchActivePlatformPaymentMethods.mockResolvedValue([])
    await renderForm()

    expect(await screen.findByText(/hindi ma-load ang payment options/i)).toBeTruthy()
  })

  it('does not submit while required fields are missing', async () => {
    await renderForm()
    await waitFor(() => expect(fetchActivePlatformPaymentMethods).toHaveBeenCalled())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    expect(submitCheckoutForm).not.toHaveBeenCalled()
    expect(await screen.findByText(/full name mo/i)).toBeTruthy()
  })

  it('keeps the visitor on the page when the lead is refused', async () => {
    submitCheckoutForm.mockResolvedValue({ data: null, error: 'Invalid payment term' })
    await renderForm()
    await waitFor(() => expect(fetchActivePlatformPaymentMethods).toHaveBeenCalled())

    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    await waitFor(() => expect(submitCheckoutForm).toHaveBeenCalled())
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('tells Meta the checkout started once, on the first field, before the Lead', async () => {
    submitCheckoutForm.mockResolvedValue({ data: { reference_number: 'SM-123', amount: 5499 }, error: null })
    await renderForm()
    await waitFor(() => expect(fetchActivePlatformPaymentMethods).toHaveBeenCalled())

    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: SUBMIT }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))

    const events = trackMetaEvent.mock.calls.map((call) => call[0])
    expect(events).toEqual(['InitiateCheckout', 'Lead'])
    expect(trackMetaEvent.mock.calls[0][1]).toMatchObject({ currency: 'PHP', value: 5499 })
    // The browser Lead carries the id the server sends, so Meta counts the pair once.
    expect(trackMetaEvent.mock.calls[1][2]).toBe('evt-1')
    expect(submitCheckoutForm.mock.calls[0][0]).toMatchObject({ meta: { eventId: 'evt-1' } })
  })
})
