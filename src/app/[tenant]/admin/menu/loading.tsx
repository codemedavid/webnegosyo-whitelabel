import { MenuSkeleton } from '@/components/admin/menu-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function MenuLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-11 w-28" />
      </div>
      <MenuSkeleton />
    </div>
  )
}
