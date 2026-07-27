/**
 * The redesigned inventory screen: a table, not a stack of cards.
 *
 * A merchant with a real pantry has dozens of ingredients, and the card list
 * made every one of them a paragraph to read. These tests cover what the table
 * has to do to replace it — show the columns, find a row, order the rows, and
 * page through them without losing what is selected.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { InventoryTable } from '@/components/admin/inventory-table'
import type { InventoryRow } from '@/lib/inventory/inventory-table'

function row(overrides: Partial<InventoryRow>): InventoryRow {
  return {
    id: 'i1',
    code: 'V01456',
    imageUrl: null,
    name: 'Broccoli',
    group: 'Vegetable',
    lastPurchaseAt: '2026-05-03T00:00:00.000Z',
    onHandLabel: '10 kg',
    onHandQty: 10,
    stockLevel: 'ok',
    isPrep: false,
    isActive: true,
    ...overrides,
  }
}

const ROWS: InventoryRow[] = [
  row({ id: 'i1', name: 'Broccoli', code: 'V01456', group: 'Vegetable', onHandQty: 10 }),
  row({ id: 'i2', name: 'Chicken', code: 'M01461', group: 'Meat', onHandQty: 56 }),
  row({ id: 'i3', name: 'Aubergine', code: 'V01457', group: 'Vegetable', onHandQty: 8 }),
]

const NOOP_HANDLERS = {
  onCreate: jest.fn(),
  onEdit: jest.fn(),
  onStock: jest.fn(),
  onRecipe: jest.fn(),
  onDelete: jest.fn(),
}

function renderTable(props: Partial<React.ComponentProps<typeof InventoryTable>> = {}) {
  return render(<InventoryTable rows={ROWS} {...NOOP_HANDLERS} {...props} />)
}

function bodyRowNames(): string[] {
  return screen
    .getAllByTestId('inventory-row')
    .map((tr) => within(tr).getByTestId('inventory-row-name').textContent ?? '')
}

beforeEach(() => jest.clearAllMocks())

describe('columns', () => {
  it('renders the table headers a merchant scans by', () => {
    renderTable()

    for (const header of ['Item Code', 'Photo', 'Item Name', 'Item Group', 'Last Purchase', 'On Hand', 'Actions']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(header, 'i') })).toBeInTheDocument()
    }
  })

  it('renders one row per ingredient with its code, group and on-hand figure', () => {
    renderTable()

    const first = screen.getAllByTestId('inventory-row')[0]
    expect(within(first).getByText('V01456')).toBeInTheDocument()
    expect(within(first).getByText('Vegetable')).toBeInTheDocument()
    expect(within(first).getByText('10 kg')).toBeInTheDocument()
  })

  it('marks a low-stock row so it reads as a warning rather than a number', () => {
    renderTable({ rows: [row({ id: 'i1', stockLevel: 'low' })] })

    expect(screen.getByLabelText(/low stock/i)).toBeInTheDocument()
  })

  it('shows a placeholder in the photo cell when the ingredient has no image', () => {
    renderTable({ rows: [row({ imageUrl: null })] })

    expect(screen.getByTestId('inventory-photo-placeholder')).toBeInTheDocument()
  })

  it('tells the merchant an item was never received instead of showing a wrong date', () => {
    renderTable({ rows: [row({ lastPurchaseAt: null })] })

    expect(screen.getByText('Never')).toBeInTheDocument()
  })
})

describe('search', () => {
  it('narrows the table to the matching rows', () => {
    renderTable()

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'chick' } })

    expect(bodyRowNames()).toEqual(['Chicken'])
  })

  it('shows an empty state rather than a blank table when nothing matches', () => {
    renderTable()

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'zzz' } })

    expect(screen.queryAllByTestId('inventory-row')).toHaveLength(0)
    expect(screen.getByText(/no ingredients match/i)).toBeInTheDocument()
  })
})

describe('sorting', () => {
  it('sorts by name ascending on the first click of the column header', () => {
    renderTable()

    fireEvent.click(screen.getByRole('button', { name: /sort by item name/i }))

    expect(bodyRowNames()).toEqual(['Aubergine', 'Broccoli', 'Chicken'])
  })

  it('reverses the order on a second click of the same header', () => {
    renderTable()
    const header = screen.getByRole('button', { name: /sort by item name/i })

    fireEvent.click(header)
    fireEvent.click(header)

    expect(bodyRowNames()).toEqual(['Chicken', 'Broccoli', 'Aubergine'])
  })

  it('sorts on-hand as a quantity, not as the text beside it', () => {
    renderTable()

    fireEvent.click(screen.getByRole('button', { name: /sort by on hand/i }))

    expect(bodyRowNames()).toEqual(['Aubergine', 'Broccoli', 'Chicken'])
  })
})

describe('pagination', () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    row({ id: `i${i}`, name: `Item ${String(i).padStart(2, '0')}` }),
  )

  it('summarises which slice of the ingredients is on screen', () => {
    renderTable({ rows: many })

    expect(screen.getByText(/showing 1 - 10 of 12 entries/i)).toBeInTheDocument()
    expect(screen.getAllByTestId('inventory-row')).toHaveLength(10)
  })

  it('moves to the next page', () => {
    renderTable({ rows: many })

    fireEvent.click(screen.getByRole('button', { name: /next page/i }))

    expect(screen.getByText(/showing 11 - 12 of 12 entries/i)).toBeInTheDocument()
    expect(screen.getAllByTestId('inventory-row')).toHaveLength(2)
  })

  it('returns to the first page when a search shrinks the result below the current page', () => {
    renderTable({ rows: many })
    fireEvent.click(screen.getByRole('button', { name: /next page/i }))

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'Item 0' } })

    expect(screen.getByText(/showing 1 - 10 of 10 entries/i)).toBeInTheDocument()
  })

  it('honours a larger page size', () => {
    renderTable({ rows: many })

    fireEvent.change(screen.getByLabelText(/entries per page/i), { target: { value: '25' } })

    expect(screen.getAllByTestId('inventory-row')).toHaveLength(12)
  })
})

describe('selection', () => {
  it('selects every visible row from the header checkbox and reports the count', () => {
    renderTable()

    fireEvent.click(screen.getByLabelText(/select all/i))

    expect(screen.getByText(/3 selected/i)).toBeInTheDocument()
  })

  it('clears one row without clearing the rest', () => {
    renderTable()
    fireEvent.click(screen.getByLabelText(/select all/i))

    fireEvent.click(screen.getByLabelText('Select Chicken'))

    expect(screen.getByText(/2 selected/i)).toBeInTheDocument()
  })
})

describe('actions', () => {
  it('asks the parent to open the create form', () => {
    const onCreate = jest.fn()
    renderTable({ onCreate })

    fireEvent.click(screen.getByRole('button', { name: /add item/i }))

    expect(onCreate).toHaveBeenCalled()
  })

  it('disables adding while the tenant has no unit to price against', () => {
    renderTable({ isCreateDisabled: true })

    expect(screen.getByRole('button', { name: /add item/i })).toBeDisabled()
  })

  it('edits the ingredient of the row the pencil belongs to', () => {
    const onEdit = jest.fn()
    renderTable({ onEdit })

    fireEvent.click(screen.getByRole('button', { name: /edit chicken/i }))

    expect(onEdit).toHaveBeenCalledWith('i2')
  })

  it('offers stock and delete behind the row menu', () => {
    const onStock = jest.fn()
    renderTable({ onStock })

    fireEvent.click(screen.getByRole('button', { name: /more actions for chicken/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /record stock/i }))

    expect(onStock).toHaveBeenCalledWith('i2')
  })

  it('offers the recipe editor only for prep items', () => {
    renderTable({ rows: [row({ id: 'i1', name: 'Sauce', isPrep: true })] })

    fireEvent.click(screen.getByRole('button', { name: /more actions for sauce/i }))

    expect(screen.getByRole('menuitem', { name: /recipe/i })).toBeInTheDocument()
  })

  it('does not offer a recipe for a raw ingredient', () => {
    renderTable({ rows: [row({ id: 'i1', name: 'Broccoli', isPrep: false })] })

    fireEvent.click(screen.getByRole('button', { name: /more actions for broccoli/i }))

    expect(screen.queryByRole('menuitem', { name: /recipe/i })).not.toBeInTheDocument()
  })
})

describe('export', () => {
  it('downloads the filtered rows as CSV', () => {
    const createObjectURL = jest.fn(() => 'blob:csv')
    const revokeObjectURL = jest.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    renderTable()
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'chick' } })

    fireEvent.click(screen.getByRole('button', { name: /export/i }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv')
  })
})
