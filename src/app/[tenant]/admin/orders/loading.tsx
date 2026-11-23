import { OrdersSkeleton } from '@/components/admin/orders-skeleton'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'

export default function OrdersLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '#' },
          { label: 'Orders' },
        ]}
      />
      <h1 className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.02em] text-wn-ink md:text-[30px]">Orders</h1>
      <OrdersSkeleton />
    </div>
  )
}
