import { render, screen } from '@testing-library/react'
import { LoyaltyProgressPanel } from '@/components/customer/loyalty-progress-panel'

const offer = { programName: 'Coffee Club', earnMode: 'stamp' as const, threshold: 8, rewardLabel: 'Free Latte', minSpend: null }
const card = { earnedOnOrder: false, programName: 'Coffee Club', earnMode: 'stamp' as const, balance: 5, threshold: 8, rewardsAvailable: 0, rewardLabel: 'Free Latte' }

const props = { offer, card, isLoading: false, storeName: 'Bean There' }

it('shows the number\'s progress toward the reward', () => {
  render(<LoyaltyProgressPanel {...props} />)
  expect(screen.getByText(/5 of 8 stamps toward Free Latte/i)).toBeInTheDocument()
  expect(screen.getAllByTestId('stamp-slot').filter(slot => slot.dataset.filled === 'true')).toHaveLength(5)
})

it('leads with the reward when one is already waiting', () => {
  render(<LoyaltyProgressPanel {...props} card={{ ...card, balance: 0, rewardsAvailable: 1 }} />)
  expect(screen.getByText(/reward ready/i)).toBeInTheDocument()
  expect(screen.getByText(/Bean There/)).toBeInTheDocument()
})

it('says nothing at all when the store runs no live offer', () => {
  const { container } = render(<LoyaltyProgressPanel {...props} offer={null} card={null} />)
  expect(container).toBeEmptyDOMElement()
})

it('says it is checking rather than showing a card that is not loaded yet', () => {
  render(<LoyaltyProgressPanel {...props} offer={null} card={null} isLoading />)
  expect(screen.getByText(/checking your stamps/i)).toBeInTheDocument()
  expect(screen.queryByTestId('stamp-track')).not.toBeInTheDocument()
})

it('still shows the offer when the number has no stamps yet', () => {
  render(<LoyaltyProgressPanel {...props} card={{ ...card, balance: 0 }} />)
  expect(screen.getByText(/0 of 8 stamps toward Free Latte/i)).toBeInTheDocument()
})
