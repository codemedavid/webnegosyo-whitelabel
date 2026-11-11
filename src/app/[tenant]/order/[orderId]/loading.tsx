import { Skeleton } from '@/components/ui/skeleton'
import { TenantFlashLoading } from '@/components/customer/flash-screen-loader'

/**
 * Shown the moment checkout hands over to tracking. Without it Next kept the
 * thank-you page on screen until the (force-dynamic) tracking page finished
 * its order + loyalty reads — seconds on a busy store.
 */
export default function OrderTrackingLoading() {
  return <TenantFlashLoading fallback={<TrackingSkeleton />} />
}

function TrackingSkeleton() {
  return (
    <div className="min-h-screen" aria-busy="true" aria-label="Loading your order">
      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
        <div className="space-y-4 rounded-3xl p-6 shadow-sm ring-1 ring-black/5">
          <Skeleton className="mx-auto h-16 w-16 rounded-full" />
          <Skeleton className="mx-auto h-7 w-56" />
          <Skeleton className="mx-auto h-4 w-64" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <div className="space-y-3 rounded-3xl p-6 shadow-sm ring-1 ring-black/5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </main>
    </div>
  )
}
