import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function MenuItemSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-video w-full" />
      <CardContent className="p-4">
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-5/6 mb-3" />
        <Skeleton className="h-6 w-20 mb-3" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-24" />
          <div className="flex gap-1">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function MenuSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-56 mb-2" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <Skeleton className="flex-1 h-10" />
        <Skeleton className="w-full sm:w-[200px] h-10" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <MenuItemSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

