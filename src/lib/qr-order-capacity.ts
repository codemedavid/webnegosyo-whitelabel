import { encodeOrderToQr } from '@/lib/qr-order-codec'
import type { QrOrderPayloadV1 } from '@/types/qr-order'

/**
 * qrcode.react 4.2.0's byte-mode capacity for a version-40 QR code at the
 * medium error-correction level used by the order page. The order codec emits
 * URL-safe ASCII, so encoded characters and bytes are equivalent here.
 */
export const QR_ORDER_MAX_MEDIUM_BYTES = 2331

export type PreparedOrderQr =
  | {
      ok: true
      qrString: string
      payload: Omit<QrOrderPayloadV1, 'ck'>
    }
  | {
      ok: false
      error: 'too_long'
      encodedLength: number
      maxEncodedLength: number
    }

export function canRenderOrderQr(qrString: string): boolean {
  return qrString.length <= QR_ORDER_MAX_MEDIUM_BYTES
}

/**
 * Remove only values whose scanner-compatible representation is already in
 * the payload. Older scanners understand structured variation selections and
 * the scheduling keys inside customerData, so no schema/version change is
 * required and no order information is lost.
 */
export function compactOrderQrPayload(
  payload: Omit<QrOrderPayloadV1, 'ck'>,
): Omit<QrOrderPayloadV1, 'ck'> {
  const customerData = payload.customerData
  const items = payload.items.map(item => {
    if (!item.variationSelections?.length || !item.variation) return item
    const structuredItem = { ...item }
    delete structuredItem.variation
    return structuredItem
  })

  const {
    scheduledFor,
    scheduledForLabel,
    ...withoutDuplicateSchedule
  } = payload

  return {
    ...withoutDuplicateSchedule,
    items,
    ...(scheduledFor && customerData.scheduled_for !== scheduledFor
      ? { scheduledFor }
      : {}),
    ...(scheduledForLabel && customerData.scheduled_for_label !== scheduledForLabel
      ? { scheduledForLabel }
      : {}),
  }
}

/** Encode once, then reject values qrcode.react cannot render at level M. */
export function prepareOrderQr(
  payload: Omit<QrOrderPayloadV1, 'ck'>,
): PreparedOrderQr {
  const compactPayload = compactOrderQrPayload(payload)
  const qrString = encodeOrderToQr(compactPayload)
  if (!canRenderOrderQr(qrString)) {
    return {
      ok: false,
      error: 'too_long',
      encodedLength: qrString.length,
      maxEncodedLength: QR_ORDER_MAX_MEDIUM_BYTES,
    }
  }
  return { ok: true, qrString, payload: compactPayload }
}
