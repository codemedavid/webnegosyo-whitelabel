export const CHECKOUT_BASE_PRICE = 3899

/** The /funnel monthly plan: billed monthly, first month paid on sign-up. */
export const MONTHLY_SUBSCRIPTION_PRICE = 1499

/** The /funnel six-month plan: six months of SmartMenu for one price. */
export const SIX_MONTH_PLAN_PRICE = 5499
export const SIX_MONTH_PLAN_MONTHS = 6

/** What a six-month buyer may pay today instead of the whole plan; the rest is a balance. */
export const SIX_MONTH_DOWNPAYMENT = 2000

export const CHECKOUT_PAYMENT_TERMS = [
  'downpayment_50',
  'full_payment',
  'monthly_subscription',
  'six_month_full',
  'six_month_downpayment',
] as const

export type CheckoutPaymentTerm = (typeof CHECKOUT_PAYMENT_TERMS)[number]

/** The terms the /funnel sells, as opposed to the old one-time checkout. */
export const FUNNEL_PLAN_TERMS = ['monthly_subscription', 'six_month_full', 'six_month_downpayment'] as const

export type FunnelPlanTerm = (typeof FUNNEL_PLAN_TERMS)[number]

export const DEFAULT_PAYMENT_TERM: CheckoutPaymentTerm = 'downpayment_50'

export function isCheckoutPaymentTerm(value: string): value is CheckoutPaymentTerm {
  return CHECKOUT_PAYMENT_TERMS.includes(value as CheckoutPaymentTerm)
}

/** `payment_term` is a nullable text column, so this takes whatever the row holds. */
export function isFunnelPlanTerm(value: string | null | undefined): value is FunnelPlanTerm {
  return FUNNEL_PLAN_TERMS.includes(value as FunnelPlanTerm)
}

/** What the buyer pays today — the amount stored on the lead. */
export function getCheckoutPayableAmount(term: CheckoutPaymentTerm): number {
  switch (term) {
    case 'downpayment_50':
      return Math.round(CHECKOUT_BASE_PRICE / 2)
    case 'full_payment':
      return CHECKOUT_BASE_PRICE
    case 'monthly_subscription':
      return MONTHLY_SUBSCRIPTION_PRICE
    case 'six_month_full':
      return SIX_MONTH_PLAN_PRICE
    case 'six_month_downpayment':
      return SIX_MONTH_DOWNPAYMENT
    default: {
      const unsupportedTerm: never = term
      throw new Error(`Unsupported checkout payment term: ${unsupportedTerm}`)
    }
  }
}

/** What is still owed on the plan after today's payment (a downpayment's balance). */
export function getCheckoutBalanceDue(term: CheckoutPaymentTerm): number {
  switch (term) {
    case 'downpayment_50':
      return CHECKOUT_BASE_PRICE - getCheckoutPayableAmount(term)
    case 'six_month_downpayment':
      return SIX_MONTH_PLAN_PRICE - SIX_MONTH_DOWNPAYMENT
    default:
      return 0
  }
}
