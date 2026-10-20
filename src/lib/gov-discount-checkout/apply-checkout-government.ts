/**
 * The checkout's Senior/PWD step, wired to the database: read the store's
 * rules, price the claim, swap it in for the vouchers when it saves more, and
 * file the grant in the sales book once the order row exists.
 *
 * Never throws and never blocks an order: a store without Tax & discounts set
 * up, or a claim the engine refuses, simply leaves the voucher pricing as is
 * (the checkout preview already told the customer).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { computeOrderTotals } from '@/lib/order-totals'
import type { OrderBackend } from '@/lib/order-backend'
import type { PricedOrder } from '@/lib/vouchers/order-pricing'
import { LEDGER_BACKEND } from '@/lib/gov-discount-ledger/reverse-on-cancel'
import {
  parseCheckoutGovClaim,
  priceCheckoutGovernment,
  type CheckoutGovItem,
  type CheckoutGovOutcome,
} from './checkout-government'

export interface AppliedCheckoutGovernment {
  pricing: PricedOrder
  outcome: CheckoutGovOutcome | null
  recordFor: (orderId: string, backend: OrderBackend) => Promise<void>
}

export async function applyCheckoutGovernment(args: {
  db: SupabaseClient<Database>
  tenantId: string
  claim: unknown
  items: readonly CheckoutGovItem[]
  serviceCharge: number
  deliveryFee: number
  voucherPricing: PricedOrder
}): Promise<AppliedCheckoutGovernment> {
  const unchanged: AppliedCheckoutGovernment = {
    pricing: args.voucherPricing,
    outcome: null,
    recordFor: async () => undefined,
  }
  const claim = parseCheckoutGovClaim(args.claim)
  if (!claim) return unchanged

  try {
    const { createSupabaseLedgerStore } = await import('@/lib/gov-discount-ledger/supabase-store')
    const store = createSupabaseLedgerStore(args.db)
    const [profile, excluded] = await Promise.all([
      store.loadTaxProfile(args.tenantId),
      store.loadExcludedMenuItemIds(args.tenantId, args.items.map((item) => item.menu_item_id)),
    ])
    if (!profile) return unchanged

    const outcome = priceCheckoutGovernment({
      claim,
      items: args.items,
      profile,
      excludedMenuItemIds: excluded,
      serviceCharge: args.serviceCharge,
      deliveryFee: args.deliveryFee,
      otherReduction: args.voucherPricing.discountPayload?.total ?? 0,
    })
    if (outcome.status !== 'applied') return { ...unchanged, outcome }

    const pricing: PricedOrder = {
      ...args.voucherPricing,
      totals: computeOrderTotals({
        subtotal: args.voucherPricing.totals.subtotal,
        deliveryFee: args.deliveryFee,
        serviceCharge: args.serviceCharge,
        discounts: outcome.lines,
      }),
      application: { ...args.voucherPricing.application, discountLines: outcome.lines },
      discountPayload: outcome.payload,
      // The vouchers were outranked, so none of them is spent.
      redemptions: [],
    }

    const recordFor = async (orderId: string, backend: OrderBackend) => {
      try {
        const { recordGovDiscount } = await import('@/lib/gov-discount-ledger/record-service')
        await recordGovDiscount(
          store,
          {
            tenantId: args.tenantId,
            backend: LEDGER_BACKEND[backend],
            externalOrderId: orderId,
            orderLabel: null,
            outletId: null,
            revision: 0,
            occurredAt: new Date().toISOString(),
            orderTotal: pricing.totals.grandTotal,
            source: 'online',
            lines: args.items.map((item, index) => ({
              key: `line-${index}`,
              menuItemId: item.menu_item_id || null,
              name: item.menu_item_name ?? 'Item',
              quantity: item.quantity,
              amount: item.subtotal,
            })),
            serviceCharge: args.serviceCharge,
            deliveryFee: args.deliveryFee,
            allowShared: false,
            government: outcome.government,
            approvalId: null,
            approvalSkippedOffline: false,
          },
          { userId: null, name: 'Online checkout' },
          new Date(),
        )
      } catch (error) {
        console.error('[checkout-government] could not file the Senior/PWD record', {
          tenantId: args.tenantId,
          orderId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return { pricing, outcome, recordFor }
  } catch (error) {
    console.error('[checkout-government] could not price the claim; vouchers stand', {
      tenantId: args.tenantId,
      error: error instanceof Error ? error.message : String(error),
    })
    return unchanged
  }
}
