import { formatMoney } from '@/lib/reports/format'
import type { ReportContext } from '@/lib/reports/read/report-context'
import { reportClient } from '@/lib/reports/read/load-report-context'
import { readPayments, readTotals } from '@/lib/reports/read/report-rpc'
import { withPrevious } from '@/lib/reports/report-view-model'
import { ReportSection } from '../../report-section'
import { ShareBar } from '../../share-bar'
import { BreakdownTable } from '../breakdown-table'

export async function PaymentsBreakdown({ context }: { context: ReportContext }) {
  const client = await reportClient()
  const { current, previous } = context.windows
  const [payments, previousPayments, totals] = await Promise.all([
    readPayments(client, current),
    previous ? readPayments(client, previous) : Promise.resolve(null),
    readTotals(client, current),
  ])
  const unpaidCents = totals.ok ? totals.data.unpaidCents : undefined

  return (
    <>
      <ReportSection
        title="How customers paid"
        description={
          totals.ok
            ? `${formatMoney(totals.data.collectedCents)} collected, ${formatMoney(totals.data.unpaidCents)} still unpaid.`
            : undefined
        }
        isError={!payments.ok}
        errorMessage={payments.ok ? undefined : payments.error.message}
      >
        {payments.ok && (
          <ShareBar
            label="Money collected, by payment method, with what is still unpaid"
            parts={payments.data.map((bucket) => ({ key: bucket.key, label: bucket.label, cents: bucket.cents }))}
            unpaidCents={unpaidCents}
            emptyMessage="No money was collected in this period."
          />
        )}
      </ReportSection>
      <ReportSection
        title="By payment method"
        description="Split payments count in each method they used. “Not recorded” is money taken without a method saved."
        isError={!payments.ok}
        errorMessage={payments.ok ? undefined : payments.error.message}
      >
        {payments.ok && (
          <BreakdownTable
            caption="Money collected by payment method"
            nameHeader="Method"
            countHeader="Orders"
            amountHeader="Collected"
            isCountAdditive={false}
            rows={withPrevious(payments.data, previousPayments?.ok ? previousPayments.data : null).map((row) => ({
              key: row.key,
              label: row.label,
              detail: row.type !== row.label ? row.type : undefined,
              count: row.orders,
              netCents: row.cents,
              previousNetCents: row.previous === undefined ? undefined : (row.previous?.cents ?? null),
            }))}
            comparePhrase={previousPayments?.ok ? (context.compare?.phrase ?? null) : null}
            emptyMessage="No money was collected in this period."
          />
        )}
      </ReportSection>
    </>
  )
}
