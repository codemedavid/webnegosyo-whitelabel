import { OrdersSkeleton } from '@/components/admin/orders-skeleton'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'

export default function OrdersLoading() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '#' },
          { label: 'Orders' },
        ]}
      />
      <OrdersSkeleton />
    </div>
  )
}

