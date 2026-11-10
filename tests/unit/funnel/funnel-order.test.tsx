/**
 * The plans + order section: six months starts chosen, the buyer can switch
 * to ₱999 a month or to the monthly plan, and the form files exactly
 * the term on screen while the summary shows what is due today.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = jest.fn()
const submitCheckoutForm = jest.fn<(...args: unknown[]) => Promise<unknown>>()

jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))
jest.mock('@/lib/meta-pixel', () => ({
  createMetaEventId: () => 'evt-1',
  getMetaBrowserData: () => ({}),
  trackMetaEvent: jest.fn(),
}))
jest.mock('@/app/actions/checkout-leads', () => ({
  submitCheckoutForm: (...args: unknown[]) => submitCheckoutForm(...args),
  fetchActivePlatformPaymentMethods: () =>
    Promise.resolve([
      {
        id: 'pm-gcash',
        name: 'GCash',
        type: 'qr_code',
        details: 'John Angelo David\n09928214519',
        qr_code_url: 'https://media.webnegosyo.com/platform-payment-qr/gcash.png',
      },
    ]),
  submitPaymentProof: jest.fn(),
}))

async function renderOrder() {
  // next/jest leaves static imports ahead of jest.mock, so load lazily.
  const { FunnelOrder } = await import('@/components/funnel/funnel-order')
  render(<FunnelOrder />)
  await screen.findByLabelText('GCash')
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, button: RegExp) {
  await user.type(screen.getByLabelText(/your name/i), 'Juan dela Cruz')
  await user.type(screen.getByLabelText(/email/i), 'juan@example.com')
  await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
  await user.type(screen.getByLabelText(/business name/i), "Juan's Kitchen")
  await user.click(screen.getByRole('button', { name: button }))
  await waitFor(() => expect(submitCheckoutForm).toHaveBeenCalledTimes(1))
  return (submitCheckoutForm.mock.calls[0][0] as { payment_term: string }).payment_term
}

function dueToday(): string {
  return screen.getByTestId('funnel-due-today').textContent ?? ''
}

describe('FunnelOrder', () => {
  beforeEach(() => {
    // jsdom has no layout, so no scrollIntoView.
    Element.prototype.scrollIntoView = jest.fn()
    push.mockReset()
    submitCheckoutForm.mockReset()
    submitCheckoutForm.mockResolvedValue({ data: { reference_number: 'SM-1', amount: 1 }, error: null })
  })

  it('starts on six months paid in full', async () => {
    await renderOrder()
    expect((screen.getByRole('radio', { name: /6 months/i }) as HTMLInputElement).checked).toBe(true)
    expect(dueToday()).toBe('₱5,499')

    const term = await fillAndSubmit(userEvent.setup(), /kunin ang 6-month plan/i)
    expect(term).toBe('six_month_full')
  })

  it('files the ₱999-a-month term and charges ₱999 today', async () => {
    await renderOrder()
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: /₱999 a month/i }))
    expect(dueToday()).toBe('₱999')
    expect(screen.getByText('₱4,995', { selector: 'dd' })).toBeTruthy()

    expect(await fillAndSubmit(user, /kunin ang 6-month plan/i)).toBe('six_month_installment')
  })

  it('shows the free seventh month only when paying in full', async () => {
    await renderOrder()
    const user = userEvent.setup()
    expect(screen.getByText(/\+1 month free/i, { selector: 'dt' })).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: /₱999 a month/i }))
    expect(screen.queryByText(/\+1 month free/i, { selector: 'dt' })).toBeNull()
  })

  it('files the monthly term when the buyer picks monthly', async () => {
    await renderOrder()
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: /monthly/i }))
    expect(dueToday()).toBe('₱1,499')
    expect(screen.queryByRole('radio', { name: /₱999 a month/i })).toBeNull()

    expect(await fillAndSubmit(user, /start monthly/i)).toBe('monthly_subscription')
  })

  it('opens the payment step on the same page as soon as the lead is saved', async () => {
    submitCheckoutForm.mockResolvedValue({ data: { reference_number: 'WN-20261105-ABCDEFGH', amount: 5499 }, error: null })
    const replaceState = jest.spyOn(window.history, 'replaceState')
    await renderOrder()

    await fillAndSubmit(userEvent.setup(), /kunin ang 6-month plan/i)

    expect(await screen.findByText('WN-20261105-ABCDEFGH')).toBeTruthy()
    expect(screen.getByAltText(/gcash qr code/i).getAttribute('src')).toBe(
      'https://media.webnegosyo.com/platform-payment-qr/gcash.png'
    )
    expect(screen.getByText('09928214519')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
    // A reload or a shared link lands on the same payment page.
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/checkout/confirmation?confirm=WN-20261105-ABCDEFGH'
    )
    replaceState.mockRestore()
  })

  it('takes the buyer to the form when they tap a plan, even the one already chosen', async () => {
    const scrollIntoView = jest.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    await renderOrder()
    const user = userEvent.setup()

    // Six months starts chosen, so its radio never fires a change: the tap must still go somewhere.
    await user.click(screen.getByText(/kunin ang 6 months/i))
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId('funnel-order-form-card'))

    await user.click(screen.getByText(/piliin ang monthly/i))
    expect((screen.getByRole('radio', { name: /monthly/i }) as HTMLInputElement).checked).toBe(true)
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2))
  })
})
