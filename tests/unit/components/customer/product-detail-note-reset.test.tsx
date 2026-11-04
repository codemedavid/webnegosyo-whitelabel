/**
 * The kitchen note on the item page is for ONE add. A diner who adds "no
 * onion" Adobo and then adds another Adobo from the same page (the sheet stays
 * mounted, the page stays open behind "Added") must start with an empty box —
 * otherwise the second dish silently carries the first one's note.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { getTenantBranding } from '@/lib/branding-utils'
import type { MenuItem } from '@/types/database'
import type { SelectedTenant } from '@/lib/product-detail-data'

const mockAddItem = jest.fn<{ ok: boolean; committedDate?: string }, unknown[]>(() => ({ ok: true }))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), prefetch: jest.fn(), replace: jest.fn() }),
}))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(() => 1), dismiss: jest.fn() }) }))
jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({ addItem: mockAddItem, setTenantContext: jest.fn(), items: [] }),
}))
jest.mock('@/hooks/use-branch-pricing', () => ({
  useBranchPricing: () => ({
    resolve: <T,>(item: T) => item,
    resolveAll: <T,>(items: T[]) => items,
    selectedOutletId: null,
  }),
}))
jest.mock('@/hooks/use-stock-ceilings', () => ({
  useStockCeilings: () => new Map(),
  useOptionStockCeilings: () => new Map(),
  selectCeiling: () => null,
}))
jest.mock('@/hooks/use-presell-availability', () => ({
  usePresellAvailability: () => ({ calendar: null, isLoading: false }),
}))
jest.mock('@/components/shared/optimized-image', () => ({ OptimizedImage: () => null }))
jest.mock('@/components/customer/product-detail-lazy', () => ({
  LazyImageModal: () => null,
  LazyRelatedItemsSection: () => null,
}))

const adobo: MenuItem = {
  id: 'adobo', tenant_id: 't1', category_id: 'mains', name: 'Adobo', description: '',
  price: 150, image_url: '', is_available: true, order: 0, created_at: '', updated_at: '',
  variations: [], addons: [],
} as MenuItem

async function renderPage() {
  const { ProductDetailContent } = await import('@/components/customer/product-detail-content')
  render(
    <ProductDetailContent
      tenant={{ id: 't1', slug: 'lolys', name: "Loly's" } as SelectedTenant}
      item={adobo}
      branding={getTenantBranding({})}
    />,
  )
}

describe('ProductDetailContent — kitchen note after an add', () => {
  beforeEach(() => mockAddItem.mockClear())

  it('sends the note with the dish, then empties the box for the next add', async () => {
    await renderPage()
    const box = screen.getByRole('textbox', { name: /note for the kitchen/i })
    fireEvent.change(box, { target: { value: 'no onion' } })

    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }))

    expect(mockAddItem).toHaveBeenCalledTimes(1)
    expect(mockAddItem.mock.calls[0][4]).toBe('no onion')
    expect(screen.getByRole('textbox', { name: /note for the kitchen/i })).toHaveValue('')
  })

  it('keeps the note when the add is refused', async () => {
    mockAddItem.mockReturnValueOnce({ ok: false, committedDate: '2026-11-05' })
    await renderPage()
    fireEvent.change(screen.getByRole('textbox', { name: /note for the kitchen/i }), { target: { value: 'no onion' } })

    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }))

    expect(screen.getByRole('textbox', { name: /note for the kitchen/i })).toHaveValue('no onion')
  })
})
