'use client'

import { useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ScanLine } from 'lucide-react'
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

  // Painted from the order page's `--trk-pickup-*` variables (Branding Studio
  // → Order status → Pickup code). The code itself stays on white: a scanner
  // needs dark modules on a light ground whatever the store's colours.
  return (
    <section
      data-branding-scope="tracking/pickup"
      className="border p-6 text-center shadow-sm"
      style={{
        borderRadius: 'var(--trk-radius)',
        backgroundColor: isReady ? 'var(--trk-pickup-ready-bg)' : 'var(--trk-pickup-bg)',
        borderColor: isReady ? 'var(--trk-pickup-ready)' : 'var(--trk-pickup-border)',
      }}
    >
      <div className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--trk-pickup-text)' }}>
        <ScanLine className="h-4 w-4" />
        {isReady ? 'Ready — show this to collect' : 'Your collection code'}
      </div>

      <div className="mx-auto w-fit bg-white p-4 shadow-sm" style={{ borderRadius: 'var(--trk-radius-inner)' }}>
        <QRCodeSVG value={encoded} size={180} level="M" marginSize={0} />
      </div>

      <p className="mt-3 text-xs font-mono tracking-widest" style={{ color: 'var(--trk-pickup-muted)' }}>
        #{shortId}
      </p>
      <p className="mt-2 text-xs" style={{ color: 'var(--trk-pickup-muted)' }}>
        {isReady
          ? 'Show this code at the counter and our staff will scan it to hand over your order.'
          : 'Keep this handy — staff will scan it when your order is ready for collection.'}
      </p>
    </section>
  )
}
