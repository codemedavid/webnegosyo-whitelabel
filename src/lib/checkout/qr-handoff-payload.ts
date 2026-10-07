/**
 * The QR hand-off order, before it is compacted into a QR code.
 *
 * Lifted out of `useCheckout.handleQrHandoff`. Pure: the id and timestamp are
 * passed in, so the payload the vendor scanner persists is unit-testable.
 * Nothing here writes anywhere — the scanner is the sole writer.
 */
import { resolveOrderContact } from '@/lib/customer-identity'
import { withInventorySelectionSnapshot } from '@/lib/inventory-selection-snapshot'
import { buildInventorySelections, buildQrOrderItems } from '@/lib/checkout/qr-order-items'
import {
  paymentProofCustomerFields,
  scheduleCustomerFields,
  type PaymentProofState,
} from '@/lib/checkout/order-submit-fields'
import type { QrOrderPayloadV1 } from '@/types/qr-order'
import type { CartBundleItem, CartItem, OrderType, PaymentMethod } from '@/types/database'

export interface QrOrderPayloadInput {
  /** Client id for this hand-off; also the QR thank-you page's route param. */
  cid: string
  /** Epoch milliseconds. */
  createdAt: number
  tenantId: string
  tenantSlug: string
  orderTypeId: string
  orderType: Pick<OrderType, 'type' | 'name'> | undefined
  /** Already normalized (phone → E.164, email lowercased, …). */
  customerData: Readonly<Record<string, string>>
  items: readonly CartItem[]
  bundleItems: readonly CartBundleItem[]
  /** The grand total the summary shows — never rebuilt here. */
  total: number
  paymentMethod: Pick<PaymentMethod, 'id' | 'name'> | null
  scheduledForISO: string | null
  scheduledForLabel: string | null
  paymentProof: PaymentProofState
}

export function buildQrOrderPayload(input: QrOrderPayloadInput): Omit<QrOrderPayloadV1, 'ck'> {
  const { customerData, scheduledForISO, scheduledForLabel, paymentMethod } = input
  const qrCustomerData = withInventorySelectionSnapshot(
    {
      ...customerData,
      ...scheduleCustomerFields(scheduledForISO, scheduledForLabel),
      ...paymentProofCustomerFields(input.paymentProof),
    },
    buildInventorySelections(input.items, input.bundleItems)
  )

  return {
    v: 1,
    cid: input.cid,
    t: input.createdAt,
    tenantId: input.tenantId,
    tenantSlug: input.tenantSlug,
    orderTypeId: input.orderTypeId,
    orderType: input.orderType?.type ?? input.orderType?.name ?? '',
    customerName: customerData.customer_name || '',
    customerContact: resolveOrderContact({ name: customerData.customer_name, customerData }),
    customerData: qrCustomerData,
    items: buildQrOrderItems(input.items, input.bundleItems),
    total: input.total,
    ...(paymentMethod ? { paymentMethodId: paymentMethod.id, paymentMethod: paymentMethod.name } : {}),
    ...(scheduledForISO ? { scheduledFor: scheduledForISO, ...(scheduledForLabel ? { scheduledForLabel } : {}) } : {}),
  }
}
