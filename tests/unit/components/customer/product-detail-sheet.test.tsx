import { act, fireEvent, render, screen } from '@testing-library/react'
import type { BrandingColors } from '@/lib/branding-utils'
import type { MenuItem, Tenant } from '@/types/database'

jest.mock('@/app/actions/product-detail', () => ({
  getProductDetailSettings: jest.fn(() => Promise.resolve(null)),
  getProductDetailUpsells: jest.fn(() => Promise.resolve({ complementaryUpsells: [], upgradeUpsells: [], upsellBundles: [] })),
}))
jest.mock('@/hooks/useBodyScrollLock', () => ({ useBodyScrollLock: () => {} }))
// The real content is a 1,200-line page; the sheet only hands it navigation.
jest.mock('@/components/customer/product-detail-content', () => ({
  ProductDetailContent: ({ item, onBack, onClose, onNavigateToItem }: {
    item: MenuItem
    onBack?: () => void
    onClose?: () => void
    onNavigateToItem?: (next: MenuItem, opts?: { fromUpgrade?: boolean }) => void
  }) => (
    <div>
      <h1>{item.name}</h1>
      <button type="button" onClick={() => onNavigateToItem?.({ ...item, id: 'meal', name: 'Pork BBQ Meal' }, { fromUpgrade: true })}>
        Make it a meal
      </button>
      <button type="button" onClick={onBack}>Back</button>
      <button type="button" onClick={onClose}>Keep browsing</button>
    </div>
  ),
}))

const dish = { id: 'bbq', name: 'Pork BBQ', price: 99, category_id: 'c', tenant_id: 't1', is_available: true } as MenuItem
const baseProps = {
  open: true,
  item: dish,
  tenant: { id: 't1', slug: 'grill' } as Tenant,
  branding: {} as BrandingColors,
  categories: [],
  allMenuItems: [dish],
}

async function renderSheet(onClose = jest.fn()) {
  const { ProductDetailSheet } = await import('@/components/customer/product-detail-sheet')
  await act(async () => {
    render(<ProductDetailSheet {...baseProps} onClose={onClose} />)
  })
  return onClose
}

describe('ProductDetailSheet navigation', () => {
  it('steps back to the dish the diner came from after choosing an upgrade', async () => {
    const onClose = await renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Make it a meal' }))
    expect(screen.getByRole('heading', { name: 'Pork BBQ Meal' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Pork BBQ' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when there is nothing to step back to', async () => {
    const onClose = await renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('still closes the whole sheet after an add, even several dishes deep', async () => {
    const onClose = await renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Make it a meal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep browsing' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
