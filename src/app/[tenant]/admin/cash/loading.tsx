import { KpiRowSkeleton, TableSkeleton } from '@/components/admin/reports'
import { Skeleton } from '@/components/ui/skeleton'

export default function CashLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading Cash & remits">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
      <KpiRowSkeleton />
      <TableSkeleton />
    </div>
  )
}
