import { ChartSkeleton, KpiRowSkeleton } from '@/components/admin/reports'
import { ReportPageFrame } from '@/components/admin/reports/sales/report-page-chrome'
import { Skeleton } from '@/components/ui/skeleton'

export default function ReportsLoading() {
  return (
    <ReportPageFrame>
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the sales report">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-11 w-full max-w-md rounded-xl" />
      </div>
      <KpiRowSkeleton />
      <ChartSkeleton />
    </ReportPageFrame>
  )
}
