import { Skeleton } from '@/components/ui/skeleton'

export default function CheckoutLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20">
      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Back button */}
          <Skeleton className="h-10 w-32" />

          {/* Order Type Selection */}
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-5 w-64 mb-6" />
            <div className="flex gap-3">
              <Skeleton className="h-12 flex-1 rounded-xl" />
              <Skeleton className="h-12 flex-1 rounded-xl" />
            </div>
          </div>

          {/* Customer Information */}
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <Skeleton className="h-8 w-56 mb-2" />
            <Skeleton className="h-5 w-72 mb-6" />
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div className="md:col-span-2">
                <Skeleton className="h-4 w-28 mb-2" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <Skeleton className="h-8 w-40 mb-4" />
            <div className="space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-16" />
              </div>
            </div>
            <div className="border-t mt-4 pt-4">
              <div className="flex justify-between">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-24" />
              </div>
            </div>
          </div>

          {/* Checkout Button */}
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </main>
    </div>
  )
}
