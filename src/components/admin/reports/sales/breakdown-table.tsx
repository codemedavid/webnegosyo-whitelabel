import type { ReactNode } from 'react'
import { UNKNOWN_FIGURE, formatCount, formatMoney, formatRatio } from '@/lib/reports/format'
import { rowShare } from '@/lib/reports/breakdown-view'
import { BarCell } from '../bar-cell'
import { DeltaPill } from '../delta-pill'
import { ReportTable, type ReportColumn } from '../report-table'

export interface BreakdownTableRow {
  key: string
  label: string
  /** A quieter second line under the name: the category, "Not on the menu now"… */
  detail?: ReactNode
  /** Items and categories count pieces; channels and branches count orders. */
  count: number
  netCents: number
  /** undefined = comparison off; null = new this period. */
  previousNetCents?: number | null
}

interface BreakdownTableProps {
  caption: string
  nameHeader: string
  countHeader: string
  /** Defaults to "Net sales". */
  amountHeader?: string
  /** False when a thing can sit in several rows (a split-paid order): the total row says "—", not a sum. */
  isCountAdditive?: boolean
  rows: BreakdownTableRow[]
  /** "on last week": finishes each change's screen-reader sentence. */
  comparePhrase: string | null
  emptyMessage: string
}

/** One breakdown, ranked, with each row's share and its change (plan §3.2). */
export function BreakdownTable({
  caption,
  nameHeader,
  countHeader,
  amountHeader = 'Net sales',
  isCountAdditive = true,
  rows,
  comparePhrase,
  emptyMessage,
}: BreakdownTableProps) {
  const totalNet = rows.reduce((sum, row) => sum + row.netCents, 0)
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0)
  const maxNet = rows.reduce((max, row) => Math.max(max, row.netCents), 0)

  const columns: ReportColumn<BreakdownTableRow>[] = [
    {
      key: 'name',
      header: nameHeader,
      render: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold text-wn-ink">{row.label}</span>
          {row.detail && <span className="text-[12.5px] font-normal text-muted-foreground">{row.detail}</span>}
        </span>
      ),
    },
    { key: 'count', header: countHeader, isNumeric: true, render: (row) => formatCount(row.count) },
    {
      key: 'net',
      header: amountHeader,
      isNumeric: true,
      render: (row) => <BarCell value={row.netCents} max={maxNet} label={formatMoney(row.netCents)} />,
    },
    { key: 'share', header: 'Share', isNumeric: true, render: (row) => formatRatio(rowShare(row.netCents, totalNet)) },
    ...(comparePhrase
      ? [
          {
            key: 'change',
            header: 'Change',
            isNumeric: true,
            render: (row: BreakdownTableRow) =>
              row.previousNetCents === null ? (
                <span className="text-[12.5px] font-semibold text-muted-foreground">New</span>
              ) : (
                <DeltaPill
                  current={row.netCents}
                  previous={row.previousNetCents}
                  polarity="higher_is_better"
                  kind="money"
                  compareLabel={comparePhrase}
                />
              ),
          } satisfies ReportColumn<BreakdownTableRow>,
        ]
      : []),
  ]

  const totals: ReactNode[] = [
    'Total',
    isCountAdditive ? formatCount(totalCount) : UNKNOWN_FIGURE,
    formatMoney(totalNet),
    totalNet > 0 ? '100%' : UNKNOWN_FIGURE,
    ...(comparePhrase ? [''] : []),
  ]

  return (
    <ReportTable
      caption={caption}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      totals={rows.length > 0 ? totals : null}
      emptyMessage={emptyMessage}
    />
  )
}
