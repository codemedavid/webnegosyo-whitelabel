import { AlertTriangle } from 'lucide-react'
import {
  feePreview,
  feeStartsRisingAtKm,
  isFlatFee,
  resolveDistanceDeliveryConfig,
} from '@/lib/delivery-fee'
import { formatPrice } from '@/lib/cart-utils'

interface DeliveryFeePreviewProps {
  /** Raw form inputs; the preview shows once all three are valid. */
  perKm: string
  minFee: string
  radiusKm: string
}

const toNumber = (value: string): number | null => (value.trim() === '' ? null : Number(value))

/**
 * What the distance formula charges, live as the merchant types. The
 * `max(minimum, km × rate)` formula keeps many setups at one price for most
 * trips (three live stores could only ever charge their minimum), which read
 * to customers as "the distance fee doesn't work".
 */
export function DeliveryFeePreview({ perKm, minFee, radiusKm }: DeliveryFeePreviewProps) {
  const config = resolveDistanceDeliveryConfig({
    enabled: true,
    perKm: toNumber(perKm),
    minFee: toNumber(minFee),
    radiusKm: toNumber(radiusKm),
  })
  if (!config) return null

  const isFlat = isFlatFee(config)
  const risesAtKm = feeStartsRisingAtKm(config)

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm font-medium">What customers pay (distance by road)</p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {feePreview(config).map((point) => (
          <div key={point.distanceKm} className="rounded-md border bg-background px-3 py-2">
            <dt className="text-xs text-muted-foreground">{`${point.distanceKm} km`}</dt>
            <dd className="text-sm font-semibold tabular-nums">{formatPrice(point.fee)}</dd>
          </div>
        ))}
      </dl>
      {isFlat ? (
        <p className="flex items-start gap-2 text-xs text-amber-700" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            With these numbers every delivery pays {formatPrice(config.minFee)}: {config.radiusKm} km ×{' '}
            {formatPrice(config.perKm)} never passes the minimum. Raise the price per km or lower the minimum fee
            if farther orders should cost more.
          </span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Every delivery under {risesAtKm.toFixed(1)} km by road pays the {formatPrice(config.minFee)} minimum;
          farther ones pay {formatPrice(config.perKm)} per km.
        </p>
      )}
    </div>
  )
}
