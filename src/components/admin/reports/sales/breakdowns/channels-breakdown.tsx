import type { ReportContext } from '@/lib/reports/read/report-context'
import { reportClient } from '@/lib/reports/read/load-report-context'
import { readDimension, type ReportDimension } from '@/lib/reports/read/report-rpc'
import type { DimensionMapping } from '@/lib/reports/read/report-rpc-rows'
import { channelMapping, orderTypeMapping, withPrevious } from '@/lib/reports/report-view-model'
import { ReportSection } from '../../report-section'
import { BreakdownTable } from '../breakdown-table'

interface DimensionSectionProps {
  context: ReportContext
  dimension: ReportDimension
  mapping: DimensionMapping
  title: string
  description: string
  nameHeader: string
}

/** One dimension's ranked table: orders and net sales, with the change. Shared by Channels and Branches. */
export async function DimensionSection({ context, dimension, mapping, title, description, nameHeader }: DimensionSectionProps) {
  const client = await reportClient()
  const { current, previous } = context.windows
  const [rows, previousRows] = await Promise.all([
    readDimension(client, current, dimension, mapping),
    previous ? readDimension(client, previous, dimension, mapping) : Promise.resolve(null),
  ])
  return (
    <ReportSection title={title} description={description} isError={!rows.ok} errorMessage={rows.ok ? undefined : rows.error.message}>
      {rows.ok && (
        <BreakdownTable
          caption={`Net sales by ${nameHeader.toLowerCase()}`}
          nameHeader={nameHeader}
          countHeader="Orders"
          rows={withPrevious(rows.data, previousRows?.ok ? previousRows.data : null).map((row) => ({
            key: row.key,
            label: row.label,
            count: row.orders,
            netCents: row.netCents,
            previousNetCents: row.previous === undefined ? undefined : (row.previous?.netCents ?? null),
          }))}
          comparePhrase={previousRows?.ok ? (context.compare?.phrase ?? null) : null}
          emptyMessage="No orders in this period."
        />
      )}
    </ReportSection>
  )
}

export function ChannelsBreakdown({ context }: { context: ReportContext }) {
  return (
    <>
      <DimensionSection
        context={context}
        dimension="source"
        mapping={channelMapping}
        title="By channel"
        description="Where orders were placed: at the counter, on your online menu, by QR or in the customer app."
        nameHeader="Channel"
      />
      <DimensionSection
        context={context}
        dimension="order_type"
        mapping={orderTypeMapping}
        title="By order type"
        description="Dine in, pickup, delivery and your own order types."
        nameHeader="Order type"
      />
    </>
  )
}
