/**
 * Classic (270 of 301 stores) showed "Edit" only for dishes with options, so a
 * plain dish's kitchen note could never be added or fixed from the cart page.
 * The other designs and the drawer already offer Edit on every line.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { ClassicCart } from '@/components/customer/cart-templates/classic-cart'
import { cartLine, makeCartView } from './cart-view-fixture'

jest.mock('@/components/shared/optimized-image', () => ({ OptimizedImage: () => null }))

describe('ClassicCart — edit a line', () => {
  it('offers Edit on a plain dish with no options', () => {
    const line = cartLine()
    const cart = makeCartView([line])
    render(<ClassicCart cart={cart} />)

    fireEvent.click(screen.getByRole('button', { name: /edit item/i }))

    expect(cart.setItemToEdit).toHaveBeenCalledWith(line)
  })
})
