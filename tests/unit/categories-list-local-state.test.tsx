/**
 * The categories page keeps its list in local state (drag-reorder moves it
 * before the server answers) and never re-reads its props. A created, renamed
 * or deleted category therefore has to land in that state from the action's
 * own result — it used to appear only after a full reload.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Category } from '@/types/database'

const createCategoryAction = jest.fn()
const updateCategoryAction = jest.fn()
const deleteCategoryAction = jest.fn()

jest.mock('@/app/actions/categories', () => ({
  createCategoryAction: (...args: unknown[]) => createCategoryAction(...args),
  updateCategoryAction: (...args: unknown[]) => updateCategoryAction(...args),
  deleteCategoryAction: (...args: unknown[]) => deleteCategoryAction(...args),
  reorderCategoriesAction: jest.fn(),
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

function category(overrides: Partial<Category>): Category {
  return {
    id: 'cat-1',
    tenant_id: 't1',
    name: 'Rice Meals',
    description: '',
    icon: '',
    icon_color: null,
    order: 0,
    is_active: true,
    display_layout: 'grid',
    default_addons: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Category
}

async function renderList(categories: Category[]) {
  // next/jest leaves static imports ahead of jest.mock; import lazily.
  const { CategoriesList } = await import('@/components/admin/categories-list')
  render(<CategoriesList categories={categories} tenantSlug="demo" tenantId="t1" />)
}

describe('CategoriesList local state', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows a newly created category without a reload', async () => {
    createCategoryAction.mockResolvedValue({ success: true, data: category({ id: 'cat-2', name: 'Drinks', order: 1 }) })
    await renderList([category({})])

    fireEvent.click(screen.getByRole('button', { name: /add category/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/category name/i), { target: { value: 'Drinks' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

    expect(await screen.findByText('Drinks')).toBeInTheDocument()
    expect(screen.getByText('Rice Meals')).toBeInTheDocument()
  })

  it('re-enables the dialog when the save request itself fails', async () => {
    createCategoryAction.mockRejectedValue(new Error('Failed to fetch'))
    await renderList([category({})])

    fireEvent.click(screen.getByRole('button', { name: /add category/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/category name/i), { target: { value: 'Drinks' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

    await waitFor(() => expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeEnabled())
  })
})
