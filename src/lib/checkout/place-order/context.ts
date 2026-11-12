/** Shapes the engine's steps pass to one another. Internal to place-order. */

import type { AdminClient } from '@/lib/supabase/admin'
import type { OrderTenantContext } from '@/lib/checkout/load-order-tenant-context'
import type { SanitizedPaymentProof } from '@/lib/checkout/payment-proof-guard'
import type { CheckoutOrderTypeRow } from '@/lib/checkout/checkout-order-type'
import type { LoyverseTenant } from '@/lib/loyverse/tenant'
import type { OrderPaymentMethod } from '@/lib/checkout/order-payment-method'
import type { OriginOutletFields } from '@/lib/delivery/delivery-origin'
import type { PlaceOrderInput, PlaceOrderLineInput } from './types'

export type { TenantSecrets } from '@/lib/tenant-secrets'

export type { AdminClient }

export type TenantConfig = Extract<OrderTenantContext, { ok: true }>['tenantConfig']

export interface ResolvedOutlet {
  id: string
  name: string
}

/** An order every gate has accepted, with its lines priced by the server. */
export interface AdmittedOrder {
  input: PlaceOrderInput
  db: AdminClient
  tenantConfig: TenantConfig
  loyverseTenant: LoyverseTenant | null
  orderTypeRow: CheckoutOrderTypeRow | null
  /** Server-priced lines. */
  lines: PlaceOrderLineInput[]
  itemsSubtotal: number
  resolvedOutlet: ResolvedOutlet | null
  /** The resolved branch's own pin and radius: a delivery starts THERE when it is pinned. */
  resolvedOutletOrigin: OriginOutletFields | null
  /** The STORED method the order records (never the caller's copy); null = none chosen. */
  paymentMethod: OrderPaymentMethod | null
  /** The Messenger chat whose link placed this order (its cart is emptied once saved). */
  chatSessionId: string | null
  validatedScheduledISO: string | undefined
  customerData: Record<string, unknown> | undefined
  paymentProof: SanitizedPaymentProof | undefined
}
