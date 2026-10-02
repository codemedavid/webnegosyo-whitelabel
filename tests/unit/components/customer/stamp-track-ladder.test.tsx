import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { StampTrack } from '@/components/customer/order-tracking/stamp-track'
import { RewardLadder } from '@/components/customer/order-tracking/reward-ladder'
import type { LoyaltyRewardStep } from '@/lib/loyalty/ladder'

const STEPS: LoyaltyRewardStep[] = [
  { at: 3, label: 'Free Iced Tea', emoji: '🥤', imageUrl: null, isFinal: false },
  { at: 6, label: 'Free Meal', emoji: '🍔', imageUrl: 'https://img/meal.jpg', isFinal: true },
]

describe('StampTrack with a reward ladder', () => {
  it('draws each reward on its own slot', () => {
    render(<StampTrack threshold={6} filled={4} earnMode="stamp" steps={STEPS} />)
    const slots = screen.getAllByTestId('stamp-slot')
    expect(slots).toHaveLength(6)
    expect(slots[2]).toHaveAttribute('data-reward', 'Free Iced Tea')
    expect(slots[2]).toHaveTextContent('🥤')
    expect(slots[2]).toHaveAttribute('data-filled', 'true')
    expect(slots[5]).toHaveAttribute('data-reward', 'Free Meal')
    expect(slots[5].querySelector('img')).toHaveAttribute('src', 'https://img/meal.jpg')
    expect(slots[0]).not.toHaveAttribute('data-reward')
  })

  it('puts reward bubbles along a points bar', () => {
    render(<StampTrack threshold={500} filled={120} earnMode="points" steps={[{ ...STEPS[0], at: 100 }, { ...STEPS[1], at: 500 }]} />)
    const markers = screen.getAllByTestId('reward-marker')
    expect(markers.map((marker) => marker.dataset.reached)).toEqual(['true', 'false'])
  })

  it('falls back to one reward on the last slot without a ladder', () => {
    render(<StampTrack threshold={4} filled={0} earnMode="stamp" />)
    expect(screen.getAllByTestId('stamp-slot')[3]).toHaveTextContent('🎁')
  })
})

describe('RewardLadder', () => {
  it('names the next reward and marks rungs already reached', () => {
    render(<RewardLadder steps={STEPS} balance={4} earnMode="stamp" />)
    expect(screen.getByTestId('next-reward')).toHaveTextContent('2 more stamps → Free Meal')
    const chips = within(screen.getByTestId('reward-ladder')).getAllByTestId('reward-chip')
    expect(chips.map((chip) => chip.dataset.reached)).toEqual(['true', 'false'])
  })

  it('shows only the headline for a single-reward card', () => {
    render(<RewardLadder steps={[STEPS[1]]} balance={1} earnMode="stamp" />)
    expect(screen.getByTestId('next-reward')).toHaveTextContent('5 more stamps → Free Meal')
    expect(screen.queryByTestId('reward-chip')).not.toBeInTheDocument()
  })
})
