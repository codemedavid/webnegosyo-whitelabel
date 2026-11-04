import type { ComponentType } from 'react'

import {
  CustomerView,
  HeaderView,
  LoyaltyView,
  OrderTypeView,
  ScheduleView,
  SmsOptInView,
  StoreClosedView,
  type CheckoutBlockViewProps,
} from './block-views-details'
import { GovDiscountView, PaymentView, PlaceOrderView, SummaryView, VoucherView } from './block-views-pay'

/**
 * One view per checkout block (src/lib/page-designer/blocks-checkout.ts),
 * shared by the storefront (live checkout) and the editor (sample checkout).
 */
export const CHECKOUT_BLOCK_VIEWS: Readonly<Record<string, ComponentType<CheckoutBlockViewProps>>> = {
  'checkout.header': HeaderView,
  'checkout.store_closed': StoreClosedView,
  'checkout.order_type': OrderTypeView,
  'checkout.schedule': ScheduleView,
  'checkout.customer': CustomerView,
  'checkout.loyalty': LoyaltyView,
  'checkout.summary': SummaryView,
  'checkout.voucher': VoucherView,
  'checkout.gov_discount': GovDiscountView,
  'checkout.payment': PaymentView,
  'checkout.sms_opt_in': SmsOptInView,
  'checkout.place_order': PlaceOrderView,
}
