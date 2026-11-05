/**
 * The cart's "Edit item" dialog shows the line's kitchen note and lets the
 * diner change it — before, it held the note in state with no box to type in,
 * so the note could be kept but never added or fixed.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { ItemDetailModal } from '@/components/customer/item-detail-modal'
import { getTenantBranding } from '@/lib/branding-utils'
import { makeCartItem } from '@/lib/cart-utils'
import { ITEM_NOTE_MAX_LENGTH } from '@/lib/item-note'
import type { MenuItem } from '@/types/database'

jest.mock('@/components/shared/optimized-image', () => ({ OptimizedImage: () => null }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

/** A plain dish: no options at all, only the note to edit. */
const latte: MenuItem = {
  id: 'latte', tenant_id: 'tenant', category_id: 'drinks', name: 'Latte', description: '',
  price: 120, image_url: '', is_available: true, order: 0, created_at: '', updated_at: '',
  variations: [], addons: [],
}

function renderEdit(note?: string) {
  const onAddToCart = jest.fn()
  const line = makeCartItem(latte, undefined, [], 2, note)
  render(<ItemDetailModal item={latte} open onClose={jest.fn()} onAddToCart={onAddToCart} branding={getTenantBranding({})} editItem={line} />)
  return onAddToCart
}

describe('ItemDetailModal — kitchen note', () => {
  it('shows the line\'s note in the box', () => {
    renderEdit('less ice')

    const box = screen.getByRole('textbox', { name: /note for the kitchen/i })
    expect(box).toHaveValue('less ice')
    expect(box).toHaveAttribute('maxLength', String(ITEM_NOTE_MAX_LENGTH))
    expect(screen.getByText(`8/${ITEM_NOTE_MAX_LENGTH}`)).toBeInTheDocument()
  })

  it('keeps the note when only the quantity changes', () => {
    const onAddToCart = renderEdit('less ice')

    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    fireEvent.click(screen.getByRole('button', { name: /update cart/i }))

    expect(onAddToCart).toHaveBeenCalledWith(latte, undefined, [], 3, 'less ice')
  })

  it('sends the changed note', () => {
    const onAddToCart = renderEdit()

    fireEvent.change(screen.getByRole('textbox', { name: /note for the kitchen/i }), { target: { value: 'no sugar' } })
    fireEvent.click(screen.getByRole('button', { name: /update cart/i }))

    expect(onAddToCart).toHaveBeenCalledWith(latte, undefined, [], 2, 'no sugar')
  })
})
