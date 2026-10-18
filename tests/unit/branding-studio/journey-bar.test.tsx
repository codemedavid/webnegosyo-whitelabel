import { fireEvent, render, screen } from '@testing-library/react'
import { JourneyBar } from '@/components/admin/branding-studio/journey-bar'

describe('JourneyBar', () => {
    it('marks the current screen and moves along the journey', () => {
        const onPick = jest.fn()
        render(<JourneyBar surfaceId="product" onPick={onPick} />)

        expect(screen.getByRole('button', { name: 'Item' })).toHaveAttribute('aria-current', 'page')
        fireEvent.click(screen.getByRole('button', { name: 'Checkout' }))
        expect(onPick).toHaveBeenCalledWith('checkout')
    })
})
