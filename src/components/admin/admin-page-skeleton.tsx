import { Skeleton } from '@/components/ui/skeleton'

const LIST_ROW_COUNT = 6

/**
 * The neutral shape of an admin page: a title block, a toolbar, a list.
 *
 * It is the root `admin/loading.tsx` fallback, so every section without its own
 * skeleton shows this the instant a sidebar link is clicked — rather than the
 * dashboard's stat cards, which is what every unlisted route used to flash.
 */
export function AdminPageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-full max-w-xs" />
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: LIST_ROW_COUNT }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
