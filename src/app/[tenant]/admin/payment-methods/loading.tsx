import { Skeleton } from '@/components/ui/skeleton'

export default function PaymentMethodsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-5 w-80 mt-2" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
