/**
 * The loyalty stamp card on the order-tracking page.
 *
 * A walk-in customer scans the receipt QR, types a mobile number, and the
 * card turns that into a stamp on the store's loyalty card. The card must:
 *   - promise a stamp ONLY when the store has a live offer,
 *   - refuse to submit until the number is a real PH mobile,
 *   - send the canonical E.164 identity, not the typed text,
 *   - show the real balance the API reports, never an invented one.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoyaltyStampCard } from '@/components/customer/loyalty-stamp-card'
import type { LoyaltyOffer } from '@/lib/loyalty/offer'

const OFFER: LoyaltyOffer = {
  programName: 'Coffee Club',
  earnMode: 'stamp',
  threshold: 8,
  rewardLabel: 'Free Iced Latte',
  minSpend: null,
}

const BASE = {
  orderId: 'order-1',
  tenantId: 'tenant-1',
  trackingToken: 'tok',
  hasName: true,
  isOrderComplete: true,
  storeName: 'Webnegosyo Coffee',
}

function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('LoyaltyStampCard', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows the stamp track and reward when the store has a live offer', () => {
    render(<LoyaltyStampCard {...BASE} offer={OFFER} />)
    const track = screen.getByTestId('stamp-track')
    expect(within(track).getAllByTestId('stamp-slot')).toHaveLength(8)
    expect(screen.getByTestId('loyalty-stamp-card')).toHaveTextContent('Free Iced Latte')
    expect(screen.getByRole('button', { name: /claim my stamp/i })).toBeInTheDocument()
  })

  it('makes no stamp promise when there is no live offer', () => {
    render(<LoyaltyStampCard {...BASE} offer={null} />)
    expect(screen.queryByTestId('stamp-track')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save my number/i })).toBeInTheDocument()
    expect(screen.getByTestId('loyalty-stamp-card')).not.toHaveTextContent(/stamp/i)
  })

  it('formats the number as it is typed and stays disabled until it is complete', async () => {
    const user = userEvent.setup()
    render(<LoyaltyStampCard {...BASE} offer={OFFER} />)
    const input = screen.getByLabelText(/mobile number/i)
    const button = screen.getByRole('button', { name: /claim my stamp/i })

    await user.type(input, '0917123')
    expect(input).toHaveValue('0917 123')
    expect(button).toBeDisabled()

    await user.type(input, '4567')
    expect(input).toHaveValue('0917 123 4567')
    expect(button).toBeEnabled()
  })

  it('submits the canonical E.164 identity, not the typed text', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(200, { success: true, loyalty: { state: 'attached' } })
    render(<LoyaltyStampCard {...BASE} offer={null} />)

    await user.type(screen.getByLabelText(/mobile number/i), '0917-123-4567')
    await user.click(screen.getByRole('button', { name: /save my number/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ orderId: 'order-1', tenantId: 'tenant-1', token: 'tok', contact: '+639171234567' })
  })

  it('includes the name only when the order has none and the customer typed one', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(200, { success: true, loyalty: { state: 'attached' } })
    render(<LoyaltyStampCard {...BASE} hasName={false} offer={null} />)

    await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
    await user.type(screen.getByLabelText(/your name/i), 'Ana')
    await user.click(screen.getByRole('button', { name: /save my number/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.name).toBe('Ana')
  })

  it('fills the stamps the API reports and names the balance', async () => {
    const user = userEvent.setup()
    mockFetch(200, {
      success: true,
      loyalty: { state: 'earned', stamps: 1, balance: 3, rewardUnlocked: false },
    })
    render(<LoyaltyStampCard {...BASE} offer={OFFER} />)

    await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
    await user.click(screen.getByRole('button', { name: /claim my stamp/i }))

    await waitFor(() => expect(screen.getByTestId('loyalty-stamp-card')).toHaveTextContent('3 of 8 stamps'))
    const filled = within(screen.getByTestId('stamp-track'))
      .getAllByTestId('stamp-slot')
      .filter((slot) => slot.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(3)
  })

  it('celebrates an unlocked reward', async () => {
    const user = userEvent.setup()
    mockFetch(200, {
      success: true,
      loyalty: { state: 'earned', stamps: 1, balance: 0, rewardUnlocked: true },
    })
    render(<LoyaltyStampCard {...BASE} offer={OFFER} />)

    await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
    await user.click(screen.getByRole('button', { name: /claim my stamp/i }))

    await waitFor(() => expect(screen.getByTestId('loyalty-stamp-card')).toHaveTextContent(/reward unlocked/i))
    expect(screen.getByTestId('loyalty-stamp-card')).toHaveTextContent('Free Iced Latte')
  })

  it('explains a pending stamp on an order that is still open', async () => {
    const user = userEvent.setup()
    mockFetch(200, { success: true, loyalty: { state: 'pending' } })
    render(<LoyaltyStampCard {...BASE} offer={OFFER} isOrderComplete={false} />)

    await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
    await user.click(screen.getByRole('button', { name: /claim my stamp/i }))

    await waitFor(() =>
      expect(screen.getByTestId('loyalty-stamp-card')).toHaveTextContent(/lands when your order is completed/i),
    )
  })

  it('tells the customer when the order already has a contact', async () => {
    const user = userEvent.setup()
    mockFetch(409, { error: 'already_set' })
    render(<LoyaltyStampCard {...BASE} offer={OFFER} />)

    await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
    await user.click(screen.getByRole('button', { name: /claim my stamp/i }))

    await waitFor(() => expect(screen.getByTestId('loyalty-stamp-card')).toHaveTextContent(/already has a number/i))
  })

  it('lets the customer retry after a failure', async () => {
    const user = userEvent.setup()
    mockFetch(503, { error: 'unavailable' })
    render(<LoyaltyStampCard {...BASE} offer={OFFER} />)

    await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
    await user.click(screen.getByRole('button', { name: /claim my stamp/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/try again/i))
    expect(screen.getByRole('button', { name: /claim my stamp/i })).toBeEnabled()
  })

  it('shows the live card, with no form, once the order has earned', () => {
    render(
      <LoyaltyStampCard
        {...BASE}
        offer={OFFER}
        view="card"
        card={{
          programName: 'Coffee Club',
          earnMode: 'stamp',
          balance: 3,
          threshold: 8,
          rewardsAvailable: 0,
          rewardLabel: 'Free Iced Latte',
        }}
      />,
    )
    expect(screen.getByTestId('stamp-card-earned')).toHaveTextContent('3 of 8 stamps')
    expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument()
    const filled = within(screen.getByTestId('stamp-track'))
      .getAllByTestId('stamp-slot')
      .filter((slot) => slot.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(3)
  })

  it('says a reward is ready when the customer holds one', () => {
    render(
      <LoyaltyStampCard
        {...BASE}
        offer={OFFER}
        view="card"
        card={{
          programName: 'Coffee Club',
          earnMode: 'stamp',
          balance: 0,
          threshold: 8,
          rewardsAvailable: 1,
          rewardLabel: 'Free Iced Latte',
        }}
      />,
    )
    expect(screen.getByTestId('stamp-card-earned')).toHaveTextContent(/reward ready/i)
    expect(screen.getByTestId('stamp-card-earned')).toHaveTextContent('Free Iced Latte')
  })

  it('tells a claimed but unfinished order that the stamp is coming', () => {
    render(<LoyaltyStampCard {...BASE} offer={OFFER} view="awaiting" isOrderComplete={false} />)
    expect(screen.getByTestId('stamp-card-awaiting')).toHaveTextContent(/lands as soon as your order is completed/i)
    expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument()
  })

  it('refuses to offer a form once the claim window has closed', () => {
    render(<LoyaltyStampCard {...BASE} offer={OFFER} view="closed" />)
    expect(screen.getByTestId('stamp-card-closed')).toHaveTextContent(/claiming is closed/i)
    expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /claim my stamp/i })).not.toBeInTheDocument()
  })

  it('closes the form when the server says the order finished mid-claim', async () => {
    const user = userEvent.setup()
    mockFetch(410, { error: 'claim_closed' })
    render(<LoyaltyStampCard {...BASE} offer={OFFER} />)

    await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
    await user.click(screen.getByRole('button', { name: /claim my stamp/i }))

    await waitFor(() => expect(screen.getByTestId('stamp-card-closed')).toBeInTheDocument())
  })

  it('tells the page to re-read the card after a successful claim', async () => {
    const user = userEvent.setup()
    mockFetch(200, { success: true, loyalty: { state: 'pending' } })
    const onClaimed = jest.fn()
    render(<LoyaltyStampCard {...BASE} offer={OFFER} onClaimed={onClaimed} />)

    await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
    await user.click(screen.getByRole('button', { name: /claim my stamp/i }))

    await waitFor(() => expect(onClaimed).toHaveBeenCalledTimes(1))
  })
})

it('replaces the QR claim confirmation with live progress when the refresh arrives', async () => {
  const user = userEvent.setup()
  mockFetch(200, { success: true, loyalty: { state: 'pending' } })
  const { rerender } = render(<LoyaltyStampCard {...BASE} offer={OFFER} isOrderComplete={false} />)
  await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
  await user.click(screen.getByRole('button', { name: /claim my stamp/i }))
  await screen.findByText('Number saved!')
  rerender(<LoyaltyStampCard {...BASE} offer={OFFER} isOrderComplete={false} view="card" card={{
    programName: 'Coffee Club', earnMode: 'stamp', balance: 3, threshold: 8, rewardsAvailable: 0, rewardLabel: 'Free Iced Latte',
  }} />)
  expect(screen.getByTestId('stamp-track')).toHaveAttribute('aria-label', '3 of 8 stamps')
  expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument()
})

it('shows existing progress without claiming that a pending order already earned', () => {
  render(<LoyaltyStampCard {...BASE} offer={OFFER} isOrderComplete={false} view="card" card={{
    programName: 'Coffee Club', earnMode: 'stamp', balance: 3, threshold: 8, rewardsAvailable: 0, rewardLabel: 'Free Iced Latte', earnedOnOrder: false,
  }} />)
  expect(screen.getByText('Your reward progress')).toBeInTheDocument()
  expect(screen.queryByText('Stamp collected!')).not.toBeInTheDocument()
  expect(screen.getByTestId('stamp-track')).toHaveAttribute('aria-label', '3 of 8 stamps')
})

describe('store logo as the stamp mark', () => {
  it('stamps filled slots with the store logo when the store has one', () => {
    render(<LoyaltyStampCard {...BASE} offer={OFFER} logoUrl="https://cdn.test/logo.png" view="card" card={{
      programName: 'Coffee Club', earnMode: 'stamp', balance: 3, threshold: 8, rewardsAvailable: 0, rewardLabel: 'Free Iced Latte',
    }} />)
    const slots = within(screen.getByTestId('stamp-track')).getAllByTestId('stamp-slot')
    const marks = slots
      .filter((slot) => slot.getAttribute('data-filled') === 'true')
      .map((slot) => slot.querySelector('img'))
    expect(marks).toHaveLength(3)
    marks.forEach((img) => {
      expect(img).not.toBeNull()
      expect(img).toHaveAttribute('src', 'https://cdn.test/logo.png')
      expect(img).toHaveAttribute('alt', '')
    })
  })

  it('leaves empty slots unstamped so the logo only marks what was earned', () => {
    render(<LoyaltyStampCard {...BASE} offer={OFFER} logoUrl="https://cdn.test/logo.png" view="card" card={{
      programName: 'Coffee Club', earnMode: 'stamp', balance: 3, threshold: 8, rewardsAvailable: 0, rewardLabel: 'Free Iced Latte',
    }} />)
    const empty = within(screen.getByTestId('stamp-track'))
      .getAllByTestId('stamp-slot')
      .filter((slot) => slot.getAttribute('data-filled') === 'false')
    expect(empty).toHaveLength(5)
    empty.forEach((slot) => expect(slot.querySelector('img')).toBeNull())
  })

  it('falls back to the check mark when the store has no logo', () => {
    render(<LoyaltyStampCard {...BASE} offer={OFFER} view="card" card={{
      programName: 'Coffee Club', earnMode: 'stamp', balance: 3, threshold: 8, rewardsAvailable: 0, rewardLabel: 'Free Iced Latte',
    }} />)
    const slots = within(screen.getByTestId('stamp-track')).getAllByTestId('stamp-slot')
    slots.forEach((slot) => expect(slot.querySelector('img')).toBeNull())
  })

  it('stamps the claim form preview and the fresh-claim celebration with the logo too', async () => {
    const user = userEvent.setup()
    mockFetch(200, { success: true, loyalty: { state: 'earned', balance: 1, rewardUnlocked: false } })
    render(<LoyaltyStampCard {...BASE} offer={OFFER} logoUrl="https://cdn.test/logo.png" />)
    await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
    await user.click(screen.getByRole('button', { name: /claim my stamp/i }))
    await screen.findByText('Stamp collected!')
    const filled = within(screen.getByTestId('stamp-track'))
      .getAllByTestId('stamp-slot')
      .filter((slot) => slot.getAttribute('data-filled') === 'true')
    expect(filled).toHaveLength(1)
    expect(filled[0].querySelector('img')).toHaveAttribute('src', 'https://cdn.test/logo.png')
  })
})
