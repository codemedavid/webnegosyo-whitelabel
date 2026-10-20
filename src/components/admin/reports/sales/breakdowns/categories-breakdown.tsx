import type { ReportContext } from '@/lib/reports/read/report-context'
import { reportClient } from '@/lib/reports/read/load-report-context'
import { readCategories, readTotals } from '@/lib/reports/read/report-rpc'
import type { CategoryReportRow } from '@/lib/reports/read/report-rpc-rows'
import { withPrevious } from '@/lib/reports/report-view-model'
import { CoverageNote } from '../../coverage-note'
import { ReportSection } from '../../report-section'
import { BreakdownTable } from '../breakdown-table'
import { LineCoverageNotes } from './items-breakdown'

function categoryDetail(row: CategoryReportRow): string | undefined {
  if (row.isUnrecorded) return 'Orders saved without their dishes'
  if (row.isUncategorised) return 'Dishes sold without a category'
  if (row.isFromCurrentMenu) return 'Partly filed by today’s menu'
  return undefined
}

export async function CategoriesBreakdown({ context }: { context: ReportContext }) {
  const client = await reportClient()
  const { current, previous } = context.windows
  const [categories, previousCategories, totals] = await Promise.all([
    readCategories(client, current),
    previous ? readCategories(client, previous) : Promise.resolve(null),
    readTotals(client, current),
  ])
  const hasMenuFallback = categories.ok && categories.data.some((row) => row.isFromCurrentMenu)

  return (
    <>
      <LineCoverageNotes totals={totals.ok ? totals.data : null} />
      {hasMenuFallback && (
        <CoverageNote tone="info">
          Orders from before categories were saved with each sale are filed under the category the dish has on today’s menu.
        </CoverageNote>
      )}
      <ReportSection
        title="By category"
        description="Net sales per menu category, after discounts. The categories add up to net sales exactly."
        isError={!categories.ok}
        errorMessage={categories.ok ? undefined : categories.error.message}
      >
        {categories.ok && (
          <BreakdownTable
            caption="Net sales by category"
            nameHeader="Category"
            countHeader="Sold"
            rows={withPrevious(categories.data, previousCategories?.ok ? previousCategories.data : null).map((row) => ({
              key: row.key,
              label: row.label,
              detail: categoryDetail(row),
              count: row.quantity,
              netCents: row.netCents,
              previousNetCents: row.previous === undefined ? undefined : (row.previous?.netCents ?? null),
            }))}
            comparePhrase={previousCategories?.ok ? (context.compare?.phrase ?? null) : null}
            emptyMessage="Nothing sold in this period."
          />
        )}
      </ReportSection>
    </>
  )
}
