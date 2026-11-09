'use client'

import {
  ORDER_BACKEND_PREFERENCES,
  type SelectableOrderBackend,
} from '@/lib/order-backend'

const ORDER_BACKEND_LABELS: Record<
  SelectableOrderBackend,
  { title: string; description: string }
> = {
  auto: {
    title: 'Automatic (recommended)',
    description: 'Use Convex when a deployment is configured, otherwise the platform database.',
  },
  convex: {
    title: 'Convex',
    description: "Always use this tenant's Convex deployment for orders.",
  },
  platform: {
    title: 'Platform database',
    description: 'Keep orders in the shared platform database even if Convex is configured.',
  },
}

/**
 * Where this tenant's orders are written and read. Both sides of the app route
 * through the same resolver, so this choice moves the whole order flow at once —
 * it never splits writes and reads across two databases.
 */
export function OrderBackendPicker({
  value,
  onChange,
  hasConvexUrl,
  isPending,
  isMovingOrders = false,
  isMoveConfirmed = false,
  onMoveConfirmedChange,
}: {
  value: SelectableOrderBackend
  onChange: (value: SelectableOrderBackend) => void
  hasConvexUrl: boolean
  isPending: boolean
  /** True when saving would change which backend the store's orders resolve to. */
  isMovingOrders?: boolean
  isMoveConfirmed?: boolean
  onMoveConfirmedChange?: (confirmed: boolean) => void
}) {
  return (
    <fieldset className="space-y-2" disabled={isPending}>
      <legend className="text-sm font-medium">Order backend</legend>
      <p className="text-sm text-muted-foreground">
        Where new orders are stored and where the admin queue reads them from.
      </p>
      <p className="text-sm text-amber-300">
        Changing this does not move existing orders. They stay on the old backend, so they disappear
        from the queue and reports, and voiding one may not return its stock.
      </p>
      <div className="space-y-2 pt-1">
        {ORDER_BACKEND_PREFERENCES.map((option) => {
          const { title, description } = ORDER_BACKEND_LABELS[option]
          // Pinning to Convex without a deployment URL would strand the orders,
          // so the option stays disabled until one is entered.
          const isDisabled = option === 'convex' && !hasConvexUrl
          return (
            <label
              key={option}
              htmlFor={`order_backend_${option}`}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                value === option ? 'border-sky-400/60 bg-sky-400/10' : 'border-white/10'
              } ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <input
                type="radio"
                id={`order_backend_${option}`}
                name="order_backend"
                className="mt-1"
                value={option}
                checked={value === option}
                disabled={isDisabled}
                onChange={() => onChange(option)}
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-sm text-muted-foreground">{description}</span>
              </span>
            </label>
          )
        })}
      </div>
      {isMovingOrders && (
        <label className="flex cursor-pointer gap-3 rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={isMoveConfirmed}
            onChange={(event) => onMoveConfirmedChange?.(event.target.checked)}
          />
          <span>I understand the existing orders will be left behind. Save is refused for stores that already have orders unless this is ticked.</span>
        </label>
      )}
    </fieldset>
  )
}
