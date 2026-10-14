import { render, screen, within } from '@testing-library/react'
import { ReportTable, type ReportColumn } from '@/components/admin/reports/report-table'

interface Row {
  id: string
  name: string
  qty: number
}

const columns: ReportColumn<Row>[] = [
  { key: 'name', header: 'Item', render: (row) => row.name },
  { key: 'qty', header: 'Sold', isNumeric: true, render: (row) => String(row.qty) },
]
const rows: Row[] = [
  { id: 'a', name: 'Adobo', qty: 12 },
  { id: 'b', name: 'Sinigang', qty: 7 },
]

describe('ReportTable', () => {
  it('is a captioned table with row headers and a totals row in tfoot', () => {
    render(
      <ReportTable
        caption="Items sold"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        totals={['Total', '19']}
        emptyMessage="No items"
      />,
    )
    const table = screen.getByRole('table', { name: 'Items sold' })
    expect(within(table).getByRole('rowheader', { name: 'Adobo' })).toBeInTheDocument()
    const tfoot = table.querySelector('tfoot') as HTMLElement
    expect(tfoot).toHaveTextContent('Total19')
  })

  it('right-aligns numeric cells with tabular figures', () => {
    render(
      <ReportTable caption="Items sold" columns={columns} rows={rows} rowKey={(row) => row.id} emptyMessage="No items" />,
    )
    const table = screen.getByRole('table')
    const cell = within(table).getByRole('cell', { name: '12' })
    expect(cell).toHaveClass('text-right', 'tabular-nums')
    expect(within(table).getByRole('columnheader', { name: 'Sold' })).toHaveClass('text-right')
    expect(within(table).getByRole('columnheader', { name: 'Item' })).toHaveClass('sticky', 'left-0')
  })

  it('also renders phone cards: first column as the title, the rest as label/value pairs', () => {
    render(
      <ReportTable
        caption="Items sold"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        totals={['Total', '19']}
        emptyMessage="No items"
      />,
    )
    const cards = screen.getByTestId('report-table-cards')
    expect(cards).toHaveClass('sm:hidden')
    const list = within(cards).getByRole('list', { name: 'Items sold' })
    const [first] = within(list).getAllByRole('listitem')
    expect(first).toHaveTextContent('Adobo')
    expect(within(first).getByRole('term')).toHaveTextContent('Sold')
    expect(within(first).getByRole('definition')).toHaveTextContent('12')
    expect(cards).toHaveTextContent('Total')
  })

  it('shows the empty message instead of an empty table', () => {
    render(<ReportTable caption="Items sold" columns={columns} rows={[]} rowKey={(row) => row.id} emptyMessage="No items yet" />)
    expect(screen.getByText('No items yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
