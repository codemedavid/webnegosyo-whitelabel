import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Category, MenuItem } from '@/types/database'

const mockUpdate = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))
jest.mock('@/app/actions/menu-items', () => ({ createMenuItemAction: jest.fn(), updateMenuItemAction: (...args: unknown[]) => mockUpdate(...args) }))
jest.mock('@/app/actions/presell', () => ({ syncPresellAllocationsAction: jest.fn() }))
jest.mock('@/app/actions/modifier-library', () => ({ createModifierGroupLibraryEntryAction: jest.fn() }))
jest.mock('@/hooks/use-menu-item-costs', () => ({ useMenuItemCosts: () => ({ optionRecipeCosts: {}, refresh: jest.fn() }) }))
jest.mock('@/components/admin/tag-manager', () => ({ TagManager: () => null }))
jest.mock('@/components/admin/recipe-editor', () => ({ RecipeEditor: () => null }))
jest.mock('@/components/admin/product-cost-field', () => ({ ProductCostField: () => null }))
jest.mock('@/components/admin/product-cost-field-convex', () => ({ ProductCostFieldConvex: () => null }))
jest.mock('@/components/admin/product-mini-performance', () => ({ ProductMiniPerformance: () => null }))
jest.mock('@/components/admin/addon-library-picker', () => ({ AddonLibraryPicker: () => null }))
jest.mock('@/components/admin/modifier-library-picker', () => ({ ModifierLibraryPicker: () => null }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }))

const CATEGORY = { id: '11111111-1111-4111-8111-111111111111', name: 'Drinks' } as Category

function makeItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Iced coffee',
    description: 'Cold brew over ice',
    price: 100,
    category_id: CATEGORY.id,
    variations: [
      { id: 'v1', name: 'Regular', price_modifier: 0, is_default: true },
      { id: 'v2', name: 'Large', price_modifier: 30 },
    ],
    variation_types: [],
    addons: [],
    ...overrides,
  } as MenuItem
}

let MenuItemForm: typeof import('@/components/admin/menu-item-form').MenuItemForm

// Imported lazily: next/jest leaves static imports ahead of jest.mock. The
// first load of the whole editor tree is slow, so it is paid once here.
beforeAll(async () => {
  ;({ MenuItemForm } = await import('@/components/admin/menu-item-form'))
}, 60_000)

async function renderForm(item: MenuItem) {
  return render(<MenuItemForm item={item} tenantId="tenant" tenantSlug="shop" categories={[CATEGORY]} />)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUpdate.mockResolvedValue({ success: true, data: { id: '22222222-2222-4222-8222-222222222222' } })
})

it('keeps a plain size list in the flat format when saved untouched', async () => {
  const { container } = await renderForm(makeItem())

  fireEvent.submit(container.querySelector('form')!)

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
  const payload = mockUpdate.mock.calls[0][3]
  expect(payload.variations.map((v: { name: string }) => v.name)).toEqual(['Regular', 'Large'])
  expect(payload.variation_types).toEqual([])
})

it('carries the sizes into a "Size" choice when a second choice is added', async () => {
  const { container } = await renderForm(makeItem())

  fireEvent.click(screen.getByRole('button', { name: 'Add a choice' }))
  fireEvent.change(screen.getAllByLabelText(/what are customers picking/i)[1], { target: { value: 'Sugar level' } })
  fireEvent.submit(container.querySelector('form')!)

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
  const payload = mockUpdate.mock.calls[0][3]
  expect(payload.variations).toEqual([])
  expect(payload.variation_types.map((t: { name: string }) => t.name)).toEqual(['Size', 'Sugar level'])
  expect(payload.variation_types[0].options).toEqual([
    expect.objectContaining({ name: 'Regular', price_modifier: 0, is_default: true }),
    expect.objectContaining({ name: 'Large', price_modifier: 30, is_default: false }),
  ])
})

it('lets only one size be the default', async () => {
  const { container } = await renderForm(makeItem())

  const [, largeDefault] = screen.getAllByRole('button', { name: /^Default/ })
  fireEvent.click(largeDefault)
  fireEvent.submit(container.querySelector('form')!)

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
  const payload = mockUpdate.mock.calls[0][3]
  expect(payload.variations.map((v: { is_default: boolean }) => v.is_default)).toEqual([false, true])
})

it('saves an emptied add-on price as free instead of NaN', async () => {
  const { container } = await renderForm(makeItem({ addons: [{ id: 'a1', name: 'Extra shot', price: 25 }] }))

  fireEvent.change(screen.getByLabelText('Price for Extra shot'), { target: { value: '' } })
  fireEvent.submit(container.querySelector('form')!)

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
  expect(mockUpdate.mock.calls[0][3].addons[0].price).toBe(0)
})

it('offers sizes or a choice when the dish has neither', async () => {
  await renderForm(makeItem({ variations: [] }))

  fireEvent.click(screen.getByRole('button', { name: /Add sizes/ }))

  expect(screen.getByLabelText('Size name')).toBeInTheDocument()
})
