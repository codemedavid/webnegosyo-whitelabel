/**
 * The expense table: rows grouped by day, newest first, with day totals that
 * count spending only (never a void, never "not an expense").
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { filterExpenses, groupByDay, NO_FILTERS, pageDayGroups } from '@/components/admin/expenses/expense-list-model'
import { CATEGORIES, ICE, LPG, OWNER_DRAW, expense } from './ui-fixtures'

const categoriesById = new Map(CATEGORIES.map((category) => [category.id, category]))
const context = { categoriesById, flagsById: new Map() }

const lpgToday = expense({ categoryId: LPG.id, amountCents: 125_000, spentOn: '2026-10-21', createdAt: '2026-10-21T01:42:00.000Z', paidFrom: 'drawer', note: 'Petron 11kg' })
const iceToday = expense({ categoryId: ICE.id, amountCents: 12_000, spentOn: '2026-10-21', createdAt: '2026-10-21T00:10:00.000Z', paidFrom: 'drawer', paidToName: 'Mang Ben' })
const voidToday = expense({ categoryId: LPG.id, amountCents: 50_000, spentOn: '2026-10-21', createdAt: '2026-10-21T00:05:00.000Z', status: 'void', voidReason: 'Entered twice' })
const drawOn19 = expense({ categoryId: OWNER_DRAW.id, amountCents: 300_000, spentOn: '2026-10-19', createdAt: '2026-10-19T09:00:00.000Z' })
const iceOn19 = expense({ categoryId: ICE.id, amountCents: 8_050, spentOn: '2026-10-19', createdAt: '2026-10-19T02:00:00.000Z', receiptCount: 1 })
const ALL = [iceOn19, voidToday, drawOn19, lpgToday, iceToday]

describe('groupByDay', () => {
  it('groups newest day first and totals only real spending', () => {
    const groups = groupByDay(filterExpenses(ALL, 'all', NO_FILTERS, context), categoriesById)

    expect(groups.map((group) => group.day)).toEqual(['2026-10-21', '2026-10-19'])
    // ₱1,250 + ₱120; the ₱500 void is listed but not counted.
    expect(groups[0].totalCents).toBe(137_000)
    expect(groups[0].rows.map((row) => row.id)).toEqual([lpgToday.id, iceToday.id, voidToday.id])
    // The owner taking ₱3,000 moved cash; it isn't spending.
    expect(groups[1].totalCents).toBe(8_050)
  })

  it('keeps a cut day’s full total when a long month is shown a page at a time', () => {
    const groups = groupByDay(filterExpenses(ALL, 'all', NO_FILTERS, context), categoriesById)

    const page = pageDayGroups(groups, 2)

    expect(page.shown).toBe(2)
    expect(page.total).toBe(5)
    expect(page.groups).toHaveLength(1)
    expect(page.groups[0].totalCents).toBe(137_000)
  })

  it('finds a row by its amount, however it is typed', () => {
    for (const query of ['1250', '1,250', '₱1,250']) {
      const rows = filterExpenses(ALL, 'all', { ...NO_FILTERS, search: query }, context)
      expect(rows.map((row) => row.id)).toEqual([lpgToday.id])
    }
  })

  it('shows only drawer pay-outs in the Drawer view', () => {
    const rows = filterExpenses(ALL, 'drawer', NO_FILTERS, context)

    expect(rows.map((row) => row.id)).toEqual([lpgToday.id, iceToday.id])
  })
})

describe('ExpensesTable', () => {
  async function renderTable(onOpen = jest.fn(), onSelectionChange = jest.fn()) {
    const { ExpensesTable } = await import('@/components/admin/expenses/expenses-table')
    const rows = filterExpenses(ALL, 'all', NO_FILTERS, context)
    render(
      <ExpensesTable
        rows={rows}
        categoriesById={categoriesById}
        outletNames={new Map()}
        flagsById={new Map()}
        today="2026-10-21"
        isMultiBranch={false}
        selectedIds={new Set()}
        onSelectionChange={onSelectionChange}
        onOpen={onOpen}
      />,
    )
    return { onOpen, onSelectionChange }
  }

  it('prints each day with its total, in tabular pesos', async () => {
    await renderTable()

    const today = screen.getByRole('columnheader', { name: 'Today' }).closest('tr') as HTMLElement
    expect(within(today).getByText('₱1,370')).toBeInTheDocument()
    const monday = screen.getByRole('columnheader', { name: 'Mon, Oct 19' }).closest('tr') as HTMLElement
    expect(within(monday).getByText('₱80.50')).toBeInTheDocument()
  })

  it('writes money out in normal ink with a minus, and strikes a void through with its reason', async () => {
    await renderTable()

    expect(screen.getByText('−₱1,250')).toBeInTheDocument()
    expect(screen.getByLabelText('500 pesos, voided')).toHaveTextContent('₱500')
    expect(screen.getByText(/Voided · Entered twice/)).toBeInTheDocument()
    // Drawer rows carry the till badge.
    expect(screen.getAllByText('Drawer')).toHaveLength(2)
  })

  it('opens a row from its keyboard button, and only recorded rows can be selected', async () => {
    const { onOpen, onSelectionChange } = await renderTable()

    fireEvent.click(screen.getByRole('button', { name: 'Open Gas / LPG, 1,250 pesos' }))
    expect(onOpen).toHaveBeenCalledWith(lpgToday)

    expect(screen.queryByRole('checkbox', { name: /voided/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select every expense shown' }))
    const selected = onSelectionChange.mock.calls[0][0] as Set<string>
    expect([...selected].sort()).toEqual([lpgToday.id, iceToday.id, drawOn19.id, iceOn19.id].sort())
  })
})
