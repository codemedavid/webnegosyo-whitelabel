/**
 * Seeing your own card on the receipt, before you claim.
 *
 * A walk-in receipt carries no phone number, so the token-authorized read has
 * nobody to look up. Until the number is typed the page can only show the
 * store's offer — and a customer with six stamps was being shown an empty row.
 * The claim form looks the typed number up as soon as it is complete.
 */
import { render, screen, waitFor } from '@testing-library/react'
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
  isOrderComplete: false,
  storeName: 'Webnegosyo Coffee',
}

const PROGRESS = {
  success: true,
  offer: OFFER,
  card: {
    earnedOnOrder: false,
    programName: 'Coffee Club',
    earnMode: 'stamp' as const,
    balance: 6,
    threshold: 8,
    rewardsAvailable: 0,
    rewardLabel: 'Free Iced Latte',
  },
}

function routeFetch(): jest.Mock {
  const mock = jest.fn(async (url: string) =>
    url === '/api/loyalty/progress'
      ? { ok: true, status: 200, json: async () => PROGRESS }
      : { ok: true, status: 200, json: async () => ({ success: true, loyalty: { state: 'pending' } }) },
  )
  global.fetch = mock as unknown as typeof fetch
  return mock
}

afterEach(() => jest.restoreAllMocks())

it('shows the stamps the typed number already holds, before anything is claimed', async () => {
  routeFetch()
  render(<LoyaltyStampCard {...BASE} offer={OFFER} />)

  await userEvent.type(screen.getByLabelText(/mobile number/i), '09171234567')

  const panel = await screen.findByTestId('loyalty-progress-panel', {}, { timeout: 3000 })
  expect(panel).toHaveTextContent('6 of 8 stamps toward Free Iced Latte')
})

it('asks about nobody until the number is a complete PH mobile', async () => {
  const fetchMock = routeFetch()
  render(<LoyaltyStampCard {...BASE} offer={OFFER} />)

  await userEvent.type(screen.getByLabelText(/mobile number/i), '0917 12')
  await new Promise(resolve => setTimeout(resolve, 800))

  expect(fetchMock).not.toHaveBeenCalled()
  expect(screen.getByTestId('stamp-track')).toBeInTheDocument()
})

it('never looks anything up when the store runs no offer', async () => {
  const fetchMock = routeFetch()
  render(<LoyaltyStampCard {...BASE} offer={null} />)

  await userEvent.type(screen.getByLabelText(/mobile number/i), '09171234567')
  await new Promise(resolve => setTimeout(resolve, 800))

  expect(fetchMock).not.toHaveBeenCalled()
})

it('stops looking up once the number has been claimed', async () => {
  const fetchMock = routeFetch()
  render(<LoyaltyStampCard {...BASE} offer={OFFER} />)

  await userEvent.type(screen.getByLabelText(/mobile number/i), '09171234567')
  await screen.findByTestId('loyalty-progress-panel', {}, { timeout: 3000 })
  await userEvent.click(screen.getByRole('button', { name: /claim my stamp/i }))
  await waitFor(() => expect(screen.getByText(/number saved/i)).toBeInTheDocument())

  const callsAfterClaim = fetchMock.mock.calls.length
  await new Promise(resolve => setTimeout(resolve, 800))
  expect(fetchMock).toHaveBeenCalledTimes(callsAfterClaim)
})
