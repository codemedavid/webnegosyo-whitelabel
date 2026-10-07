import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'

export function CustomersSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full sm:max-w-xs" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="border-b bg-muted/40 px-4 py-3">
          <Skeleton className="h-3 w-1/3" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="hidden h-5 w-16 sm:block" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="hidden h-4 w-24 md:block" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </Card>
    </div>
  )
}
