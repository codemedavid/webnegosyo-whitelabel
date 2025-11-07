import { SkeletonCard } from '@/components/shared/skeleton-card'
import { Skeleton } from '@/components/ui/skeleton'

export function OrdersSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48 mb-2" />
        <Skeleton className="h-5 w-64" />
      </div>

      <div className="flex gap-4 mb-6">
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-10 w-[200px]" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}

