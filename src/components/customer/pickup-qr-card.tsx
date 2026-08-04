'use client'

import { useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ScanLine } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { encodePickupQr } from '@/lib/qr-order-codec'

interface PickupQrCardProps {
  orderId: string
  tenantId: string
  /** The order's HMAC tracking token, already in the page's URL. */
  trackingToken: string
  /** Rendered under the code so staff and customer can agree they match. */
  shortId: string
  /** True once the order is ready, which changes the copy only. */
  isReady: boolean
}

/**
 * The customer's scan-to-collect code.
 *
 * Staff scan this in the merchant app to pull up the order and confirm they
 * are handing it to the right person. The payload is a pointer plus the
 * order's tracking token — the app cannot verify the token itself and has the
 * web API do it, so nothing secret is encoded here.
 */
export function PickupQrCard({
  orderId,
  tenantId,
  trackingToken,
  shortId,
  isReady,
}: PickupQrCardProps) {
  // `t` is a timestamp only, so the value is stable for a given order and the
  // code does not churn between renders or polls.
  const encoded = useMemo(
    () =>
      encodePickupQr({
        v: 1,
        k: 'pickup',
        tenantId,
        orderId,
        token: trackingToken,
        t: 0,
      }),
    [orderId, tenantId, trackingToken]
  )

  return (
    <Card className={isReady ? 'border-green-300 bg-green-50/40' : undefined}>
      <CardContent className="p-6 text-center">
        <div className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <ScanLine className="h-4 w-4" />
          {isReady ? 'Ready — show this to collect' : 'Your collection code'}
        </div>

        <div className="mx-auto w-fit rounded-xl bg-white p-4 shadow-sm">
          <QRCodeSVG value={encoded} size={180} level="M" marginSize={0} />
        </div>

        <p className="mt-3 text-xs font-mono tracking-widest text-gray-500">
          #{shortId}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          {isReady
            ? 'Show this code at the counter and our staff will scan it to hand over your order.'
            : 'Keep this handy — staff will scan it when your order is ready for collection.'}
        </p>
      </CardContent>
    </Card>
  )
}
