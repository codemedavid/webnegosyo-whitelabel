import { Skeleton } from '@/components/ui/skeleton'

/** The book's shape while it loads: title, hero total, views, then rows. */
export function ExpensesSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5" aria-busy="true" aria-label="Loading expenses">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-11 w-36 rounded-full" />
      </div>
      <Skeleton className="h-[118px] w-full rounded-2xl" />
      <div className="flex gap-1.5">
        {[64, 120, 96, 112].map((width) => (
          <Skeleton key={width} className="h-11 rounded-full" style={{ width }} />
        ))}
      </div>
      <div className="flex flex-col gap-px overflow-hidden rounded-2xl ring-1 ring-border">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-none" />
        ))}
      </div>
    </div>
  )
}
