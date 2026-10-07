import { Skeleton } from '@/components/ui/skeleton'

/** Matches the dashboard's layout so the page doesn't jump when data lands. */
export function AnalyticsDashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-[62px] w-full rounded-2xl" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-72 rounded-full" />
      </div>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-border">
        <div className="grid grid-cols-2 gap-2 p-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
        <div className="border-t border-wn-line p-5">
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <Skeleton className="h-64 w-full rounded-2xl lg:col-span-3" />
        <Skeleton className="h-64 w-full rounded-2xl lg:col-span-2" />
      </div>
    </div>
  )
}
