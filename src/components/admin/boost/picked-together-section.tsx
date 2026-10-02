import { getBasketSummary } from '@/lib/boost/order-baskets'
import { getBoostMenu, type BoostTenantFields } from '@/lib/boost/workspace'
import { PickedTogether } from './picked-together'

interface PickedTogetherSectionProps {
  tenant: BoostTenantFields
  className?: string
}

/**
 * Loads the store's basket summary (from its real order backend) and renders
 * it. Async, so pages stream it inside <Suspense> instead of waiting on it.
 */
export async function PickedTogetherSection({ tenant, className }: PickedTogetherSectionProps) {
  try {
    const [summary, menu] = await Promise.all([getBasketSummary(tenant.id), getBoostMenu(tenant)])
    return <PickedTogether summary={summary} items={menu.items} className={className} />
  } catch (error) {
    console.error('[boost] picked-together failed:', error)
    return (
      <PickedTogether
        summary={{
          dataSource: 'platform',
          isAvailable: false,
          note: 'Your order history could not be read right now. Try again in a few minutes.',
          windowLabel: '',
          orderCount: 0,
          itemOrders: {},
          pairs: [],
        }}
        items={[]}
        className={className}
      />
    )
  }
}

export function PickedTogetherSkeleton() {
  return <div className="h-48 animate-pulse rounded-2xl border bg-muted/40" aria-hidden="true" />
}
