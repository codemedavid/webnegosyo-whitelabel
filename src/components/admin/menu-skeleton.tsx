import { Skeleton } from '@/components/ui/skeleton'

const PLACEHOLDER_ROWS = 6

/** The menu list's rows while they load; the page header renders outside it. */
export function MenuSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading your menu">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-full sm:w-[220px]" />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <div className="divide-y rounded-xl border bg-card">
          {Array.from({ length: PLACEHOLDER_ROWS }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The dish editor's shape while its page loads, so opening a dish does not jump. */
export function MenuItemEditorSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-5" aria-busy="true" aria-label="Loading dish">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-7 w-56" />
      </div>
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <Skeleton className="mb-4 h-5 w-28" />
        <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-11 w-full" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
        <Skeleton className="mt-5 h-20 w-full" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  )
}
