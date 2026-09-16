import { fireEvent, render, screen } from '@testing-library/react'
import { ItemDetailModal } from '@/components/customer/item-detail-modal'
import { getTenantBranding } from '@/lib/branding-utils'
import { makeCartItem } from '@/lib/cart-utils'
import type { MenuItem } from '@/types/database'

jest.mock('@/components/shared/optimized-image', () => ({ OptimizedImage: () => null }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const item: MenuItem = {
  id: 'burger', tenant_id: 'tenant', category_id: 'mains', name: 'Burger', description: 'Burger',
  price: 100, image_url: '', is_available: true, order: 0, created_at: '', updated_at: '',
  variations: [], addons: [{ id: 'cheese', name: 'Cheese', price: 10 }],
  modifier_groups: [{ id: 'extras', name: 'Extras', selection_mode: 'quantity', display_order: 0, min_select: 0, max_select: null,
    options: [{ id: 'cheese', name: 'Cheese', price_modifier: 10, display_order: 0 }] }],
}

it('edits a cart extra quantity without dropping the other portions or parent quantity', () => {
  const onAddToCart = jest.fn()
  const cart = makeCartItem(item, {}, [{ id: 'cheese', name: 'Cheese', price: 10, quantity: 3 }], 2)
  render(<ItemDetailModal item={item} open onClose={jest.fn()} onAddToCart={onAddToCart} branding={getTenantBranding({})} editItem={cart} />)
  expect(screen.getByLabelText('Cheese quantity')).toHaveTextContent('3')
  fireEvent.click(screen.getByRole('button', { name: 'Decrease Cheese' }))
  expect(screen.getByLabelText('Cheese quantity')).toHaveTextContent('2')
  fireEvent.click(screen.getByRole('button', { name: /Update Cart/i }))
  expect(onAddToCart).toHaveBeenCalledWith(item, {}, [{ id: 'cheese', name: 'Cheese', price: 10, quantity: 2 }], 2, '')
})
