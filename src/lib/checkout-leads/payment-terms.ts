export const CHECKOUT_BASE_PRICE = 3899

export const CHECKOUT_PAYMENT_TERMS = ['downpayment_50', 'full_payment'] as const

export type CheckoutPaymentTerm = (typeof CHECKOUT_PAYMENT_TERMS)[number]

export const DEFAULT_PAYMENT_TERM: CheckoutPaymentTerm = 'downpayment_50'

export function isCheckoutPaymentTerm(value: string): value is CheckoutPaymentTerm {
  return CHECKOUT_PAYMENT_TERMS.includes(value as CheckoutPaymentTerm)
}

export function getCheckoutPayableAmount(term: CheckoutPaymentTerm): number {
  switch (term) {
    case 'downpayment_50':
      return Math.round(CHECKOUT_BASE_PRICE / 2)
    case 'full_payment':
      return CHECKOUT_BASE_PRICE
    default: {
      const unsupportedTerm: never = term
      throw new Error(`Unsupported checkout payment term: ${unsupportedTerm}`)
    }
  }
}
