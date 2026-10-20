import { Skeleton } from '@/components/ui/skeleton'

/** The page's shape while it loads: header, hero, tabs, four rows. */
export function TextsSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16" aria-busy="true" aria-label="Loading your texts">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-9 w-80 max-w-full rounded-lg" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
