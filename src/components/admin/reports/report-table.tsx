import type { Key, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ReportColumn<Row> {
  key: string
  header: string
  align?: 'left' | 'right'
  /** Numbers: right-aligned, tabular, lining figures. */
  isNumeric?: boolean
  render: (row: Row) => ReactNode
}

export interface ReportTableProps<Row> {
  /** What the table is. Read by screen readers; visible only with `isCaptionVisible`. */
  caption: string
  isCaptionVisible?: boolean
  /** The first column titles each row (and each phone card). */
  columns: ReportColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => Key
  /** One cell per column, in column order. Rendered in <tfoot>. */
  totals?: ReactNode[] | null
  emptyMessage: string
  className?: string
}

const NUMERIC = 'text-right tabular-nums lining-nums'

function alignClass<Row>(column: ReportColumn<Row>): string {
  if (column.isNumeric) return NUMERIC
  return column.align === 'right' ? 'text-right' : 'text-left'
}

/**
 * A ranked report table. From 640px: a real <table> with a sticky header,
 * sticky first column and a totals row. Below 640px: the same rows as stacked
 * cards (first column = title, the rest as label/value pairs). Both markups
 * render; CSS shows one, and `display: none` keeps the other out of the
 * accessibility tree, so nothing is read twice.
 */
export function ReportTable<Row>({
  caption,
  isCaptionVisible = false,
  columns,
  rows,
  rowKey,
  totals,
  emptyMessage,
  className,
}: ReportTableProps<Row>) {
  if (rows.length === 0) {
    return (
      <p className={cn('rounded-xl bg-wn-sand px-4 py-6 text-center text-[14px] text-muted-foreground', className)}>
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className={className}>
      <DesktopTable
        caption={caption}
        isCaptionVisible={isCaptionVisible}
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        totals={totals}
      />
      <CardList caption={caption} columns={columns} rows={rows} rowKey={rowKey} totals={totals} />
    </div>
  )
}

type PartProps<Row> = Pick<ReportTableProps<Row>, 'caption' | 'columns' | 'rows' | 'rowKey' | 'totals'>

function DesktopTable<Row>({
  caption,
  isCaptionVisible,
  columns,
  rows,
  rowKey,
  totals,
}: PartProps<Row> & { isCaptionVisible: boolean }) {
  const [first, ...rest] = columns
  return (
    <div className="hidden max-h-[min(70vh,720px)] overflow-auto rounded-xl ring-1 ring-border sm:block">
      <table className="w-full border-separate border-spacing-0 text-[14px]">
        <caption
          className={cn(
            isCaptionVisible ? 'px-4 pb-2 pt-3 text-left text-[13px] font-semibold text-muted-foreground' : 'sr-only',
          )}
        >
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'sticky top-0 z-10 border-b border-border bg-wn-sand px-4 py-2.5 text-[12.5px] font-semibold text-wn-stone whitespace-nowrap',
                  index === 0 && 'left-0 z-20',
                  alignClass(column),
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="group">
              <th
                scope="row"
                className={cn(
                  'sticky left-0 z-[1] border-b border-border bg-white px-4 py-2.5 font-semibold text-foreground group-last:border-b-0 group-hover:bg-wn-sand',
                  alignClass(first),
                )}
              >
                {first.render(row)}
              </th>
              {rest.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'border-b border-border bg-white px-4 py-2.5 text-foreground group-last:border-b-0 group-hover:bg-wn-sand',
                    alignClass(column),
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              {columns.map((column, index) => {
                const Cell = index === 0 ? 'th' : 'td'
                return (
                  <Cell
                    key={column.key}
                    scope={index === 0 ? 'row' : undefined}
                    className={cn(
                      'sticky bottom-0 border-t-2 border-wn-ink/80 bg-white px-4 py-3 font-extrabold text-wn-ink',
                      index === 0 && 'left-0 z-20',
                      alignClass(column),
                    )}
                  >
                    {totals[index] ?? null}
                  </Cell>
                )
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function CardList<Row>({ caption, columns, rows, rowKey, totals }: PartProps<Row>) {
  const [first, ...rest] = columns
  return (
    <div className="sm:hidden" data-testid="report-table-cards">
      <ul aria-label={caption} className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-xl bg-white px-4 py-3 ring-1 ring-border">
            <div className="text-[15px] font-bold text-foreground">{first.render(row)}</div>
            <dl className="mt-1.5 flex flex-col gap-1">
              {rest.map((column) => (
                <div key={column.key} className="flex items-center justify-between gap-4 text-[14px]">
                  <dt className="text-muted-foreground">{column.header}</dt>
                  <dd className={cn('min-w-0 font-semibold text-foreground', column.isNumeric && NUMERIC)}>
                    {column.render(row)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      {totals && (
        <div className="mt-2 rounded-xl bg-wn-sand px-4 py-3 ring-1 ring-wn-line">
          <div className="text-[15px] font-extrabold text-wn-ink">{totals[0] ?? 'Total'}</div>
          <dl className="mt-1.5 flex flex-col gap-1">
            {rest.map((column, index) => (
              <div key={column.key} className="flex items-center justify-between gap-4 text-[14px]">
                <dt className="text-wn-stone">{column.header}</dt>
                <dd className={cn('font-extrabold text-wn-ink', column.isNumeric && NUMERIC)}>
                  {totals[index + 1] ?? null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
