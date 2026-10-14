import type { ReportContext } from '@/lib/reports/read/report-context'
import { outletMapping } from '@/lib/reports/report-view-model'
import { DimensionSection } from './channels-breakdown'

export function BranchesBreakdown({ context }: { context: ReportContext }) {
  return (
    <DimensionSection
      context={context}
      dimension="outlet"
      mapping={outletMapping(context.outletNames)}
      title="By branch"
      description="Each branch’s orders and net sales. “Unassigned” are orders taken without a branch; together they add up to the store."
      nameHeader="Branch"
    />
  )
}
