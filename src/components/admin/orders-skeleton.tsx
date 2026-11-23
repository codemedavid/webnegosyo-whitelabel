import { Skeleton } from '@/components/ui/skeleton'

/** The Orders table's shape while its first read loads: tabs, filters, rows. */
export function OrdersSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading orders">
      <div className="flex gap-2 border-b border-wn-line pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-lg" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-full rounded-xl sm:w-[260px]" />
        <Skeleton className="h-10 w-[150px] rounded-xl" />
        <Skeleton className="h-10 w-[150px] rounded-xl" />
      </div>
      <div className="divide-y divide-wn-line rounded-2xl bg-white ring-1 ring-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="hidden h-9 w-32 md:block" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="hidden h-9 w-24 md:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
