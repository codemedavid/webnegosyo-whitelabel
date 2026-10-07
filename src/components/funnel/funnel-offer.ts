import { MONTHLY_SUBSCRIPTION_PRICE } from '@/lib/checkout-leads/payment-terms'

/**
 * The /funnel offer — the numbers every section quotes. The page price IS the
 * price the order form charges (`monthly_subscription` in checkout_leads), so
 * it is imported, never retyped.
 */
export const FUNNEL_PRICE = MONTHLY_SUBSCRIPTION_PRICE

/** The real done-for-you setup fee from the one-time offer, waived here as a bonus. */
export const SETUP_FEE_WAIVED = 3499

const DAYS_PER_MONTH = 30

/** "≈ ₱33 a day" framing — the price spread across a month. */
export const FUNNEL_DAILY_PRICE = Math.round(FUNNEL_PRICE / DAYS_PER_MONTH)

/** The order form's section id. Every CTA on the page scrolls here. */
export const FUNNEL_ORDER_ANCHOR = 'order'
export const FUNNEL_CTA_HREF = `#${FUNNEL_ORDER_ANCHOR}`

/** The offer's name — what the merchant is saying yes to. */
export const OFFER_NAME = 'SmartMenu Growth System'

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH')}`
}

export interface StackItem {
  title: string
  detail: string
  /** What it would cost to build or buy on its own, in pesos. */
  value: number
  isBonus?: boolean
}

/**
 * Hormozi's value stack. Values for the core items are estimates of what a
 * merchant would pay to have each piece built or subscribed separately — the
 * owner should keep them honest. The setup bonus is the real one-time fee.
 */
export const VALUE_STACK: readonly StackItem[] = [
  {
    title: 'Own ordering website + link',
    detail: 'Branded menu at checkout para mas easy umorder anytime, plus 0% commission sa sarili mong orders.',
    value: 15000,
  },
  {
    title: 'Automatic upsell engine',
    detail: 'Automatic add-ons, upgrades at last offers para may chance maging bigger ang bawat basket.',
    value: 5000,
  },
  {
    title: 'Digital stamp card',
    detail: 'Built-in loyalty para may progress at reason ang customers na bumalik for another order.',
    value: 3000,
  },
  {
    title: 'SMS to regulars',
    detail: 'Direct follow-up para ma-invite mo ulit ang past customers sa promos, new dishes at comeback offers.',
    value: 2000,
  },
  {
    title: 'Merchant app + POS + inventory',
    detail: 'Manage online orders, walk-ins at stocks nang mas organized gamit ang merchant tools.',
    value: 5000,
  },
  {
    title: 'Analytics + AI Growth Coach',
    detail: "See what's selling, what's slow, at kung anong combo o offer ang puwede mong subukan next.",
    value: 2000,
  },
  {
    title: 'BONUS: Done-for-you setup',
    detail: 'Kami ang magse-set up ng menu, branding, combos, upsells, stamp card at payment options mo.',
    value: SETUP_FEE_WAIVED,
    isBonus: true,
  },
] as const

export function stackTotalValue(): number {
  return VALUE_STACK.reduce((total, item) => total + item.value, 0)
}
