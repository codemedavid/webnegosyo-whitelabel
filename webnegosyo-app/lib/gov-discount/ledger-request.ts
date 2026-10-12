/**
 * The contract between the register and the server's sales book.
 *
 * After a sale (or an edit) the register posts this to
 * `POST /api/gov-discounts/record`. The server never takes the amounts on
 * trust: it re-prices the claimants with the same engine against the order's
 * lines, the store's tax profile and each item's eligibility, records both
 * figures, and flags any difference for the owner.
 */

import type { StoredGovDiscount } from './payload'

export type GovLedgerBackend = 'convex' | 'tenant_supabase' | 'platform_supabase'

/** One order line as the register priced it. */
export interface GovLedgerLine {
  /** The allocation key the claimants' units refer to. */
  key: string
  menuItemId: string | null
  name: string
  quantity: number
  /** VAT-inclusive line subtotal in pesos. */
  amount: number
}

export interface RecordGovDiscountRequest {
  tenantId: string
  backend: GovLedgerBackend
  externalOrderId: string
  /** "#12" — the order number printed on the receipt. */
  orderLabel: string | null
  outletId: string | null
  /** 0 for a new sale; the order's revision number after an edit. */
  revision: number
  /** When the sale happened (ISO), which may be earlier than now offline. */
  occurredAt: string
  orderTotal: number
  source: 'pos' | 'online'
  lines: GovLedgerLine[]
  serviceCharge: number
  deliveryFee: number
  /** False for take-out and delivery. */
  allowShared: boolean
  /** The order's government block — null when an edit removed it. */
  government: StoredGovDiscount | null
  /** A manager's one-time approval, when one was given. */
  approvalId: string | null
  /** The register needed a manager but could not reach the server. */
  approvalSkippedOffline: boolean
}

export const MAX_LEDGER_LINES = 200
