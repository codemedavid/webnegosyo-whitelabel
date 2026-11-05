import {
  BarChart3,
  Boxes,
  CreditCard,
  Gift,
  type LucideIcon,
  MessageSquareText,
  PackagePlus,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'
import {
  MONTHLY_SUBSCRIPTION_PRICE,
  SIX_MONTH_DOWNPAYMENT,
  SIX_MONTH_PLAN_MONTHS,
  SIX_MONTH_PLAN_PRICE,
  getCheckoutBalanceDue,
  getCheckoutPayableAmount,
  type FunnelPlanTerm,
} from '@/lib/checkout-leads/payment-terms'

/**
 * The /funnel offer: every number a section quotes. Plan prices are imported
 * from the terms the order form charges, never retyped.
 */
export const MONTHLY_PRICE = MONTHLY_SUBSCRIPTION_PRICE
export const SIX_MONTH_PRICE = SIX_MONTH_PLAN_PRICE
export const SIX_MONTH_MONTHS = SIX_MONTH_PLAN_MONTHS
export const SIX_MONTH_DOWN = SIX_MONTH_DOWNPAYMENT

/** Six months paid monthly, the anchor the six-month price is struck against. */
export const SIX_MONTHS_AT_MONTHLY = MONTHLY_PRICE * SIX_MONTH_MONTHS
export const SIX_MONTH_SAVINGS = SIX_MONTHS_AT_MONTHLY - SIX_MONTH_PRICE
export const SIX_MONTH_PER_MONTH = Math.round(SIX_MONTH_PRICE / SIX_MONTH_MONTHS)
export const SIX_MONTH_BALANCE = getCheckoutBalanceDue('six_month_downpayment')

/** The real done-for-you setup fee, waived on the six-month plan only. */
export const SETUP_FEE_WAIVED = 3499

/**
 * The six-month deal's countdown runs to this instant (Manila end of day, seven
 * days after launch). It is a fixed date, never a timer that restarts per
 * visit: once it passes the countdown simply disappears.
 */
export const SIX_MONTH_DEAL_ENDS_AT = '2026-11-11T23:59:59+08:00'
export const SIX_MONTH_DEAL_ENDS_MS = Date.parse(SIX_MONTH_DEAL_ENDS_AT)

/** The order section's id. Every CTA on the page scrolls here. */
export const FUNNEL_ORDER_ANCHOR = 'order'
export const FUNNEL_CTA_HREF = `#${FUNNEL_ORDER_ANCHOR}`

/** The offer's name: what the merchant is saying yes to. */
export const OFFER_NAME = 'SmartMenu Growth System'

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH')}`
}

export type FunnelPlanId = 'six_month' | 'monthly'
export type SixMonthPayment = 'full' | 'downpayment'

/** The checkout term a plan choice files. */
export function termForPlan(plan: FunnelPlanId, payment: SixMonthPayment): FunnelPlanTerm {
  if (plan === 'monthly') return 'monthly_subscription'
  return payment === 'downpayment' ? 'six_month_downpayment' : 'six_month_full'
}

export function dueTodayFor(term: FunnelPlanTerm): number {
  return getCheckoutPayableAmount(term)
}

export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
}

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Time left until `endsAtMs`, or null once it has passed. */
export function countdownParts(endsAtMs: number, nowMs: number): CountdownParts | null {
  const left = endsAtMs - nowMs
  if (!Number.isFinite(left) || left <= 0) return null
  return {
    days: Math.floor(left / DAY_MS),
    hours: Math.floor((left % DAY_MS) / HOUR_MS),
    minutes: Math.floor((left % HOUR_MS) / MINUTE_MS),
    seconds: Math.floor((left % MINUTE_MS) / SECOND_MS),
  }
}

export interface FunnelFeature {
  name: string
  detail: string
  icon: LucideIcon
}

export interface FeatureGroup {
  number: string
  title: string
  /** A real app screen for the phase (the marketing headline on top is cropped away). */
  screen: { src: string; alt: string }
  features: readonly FunnelFeature[]
}

/**
 * Everything in both plans, as the reference's three numbered phases. Every
 * line describes something the product does today.
 */
export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    number: '01',
    title: 'Mas maraming orders, kahit saan sila umorder',
    screen: { src: '/download/screens/02-orders.webp', alt: 'New orders ringing in the SmartMenu merchant app' },
    features: [
      {
        name: 'SmartMenu Ordering',
        detail: "Dine-in, pick-up at delivery sa sarili mong link at QR. Walang app na kailangang i-download ng customer.",
        icon: ShoppingBag,
      },
      {
        name: 'Lalamove Integration',
        detail: 'Mag-book ng Lalamove rider diretso from the order, kasama na ang quotation at tracking.',
        icon: Truck,
      },
      {
        name: 'Unlimited Products',
        detail: "Ilagay lahat ng dishes, variations at add-ons mo. Walang limit, walang dagdag bayad.",
        icon: PackagePlus,
      },
      {
        name: 'Unlimited Payment Methods',
        detail: 'GCash, Maya, bank transfer o cash. Idagdag lahat ng payment options na tinatanggap mo.',
        icon: CreditCard,
      },
    ],
  },
  {
    number: '02',
    title: 'Patakbuhin ang store nang organized',
    screen: { src: '/download/screens/03-register.webp', alt: 'The SmartMenu POS register with a printed receipt' },
    features: [
      {
        name: 'POS',
        detail: 'Register para sa walk-ins, with receipt printing, tapos isang listahan lang ng orders online man o sa counter.',
        icon: Store,
      },
      {
        name: 'Inventory',
        detail: 'Kusang nababawas ang stock bawat order, at may low-stock alert sa phone mo bago ka maubusan.',
        icon: Boxes,
      },
      {
        name: 'Expense Tracker',
        detail: "I-record ang gastos at bills to pay, para makita mo ang totoong profit, hindi lang sales.",
        icon: Wallet,
      },
      {
        name: 'Sales Revenue Analytics',
        detail: 'Daily sales, best sellers, payment methods at peak hours, sa isang tingin lang.',
        icon: BarChart3,
      },
    ],
  },
  {
    number: '03',
    title: 'Bigger orders at regulars na bumabalik',
    screen: { src: '/download/screens/07-loyalty.webp', alt: 'A SmartMenu stamp card in the customer’s wallet' },
    features: [
      {
        name: 'Auto-Suggest Upsells & Bundles',
        detail: 'Automatic upsells, combos at "add fries?" offers habang umo-order, para bigger orders ang bawat basket.',
        icon: Sparkles,
      },
      {
        name: 'Loyalty Programs',
        detail: 'Digital stamp cards at rewards, pwede pa sa Apple o Google Wallet, para may reason silang bumalik.',
        icon: Gift,
      },
      {
        name: 'Customer Growth',
        detail: "Sariling customer list: sino ang regulars, sino ang first-timers, at sino ang matagal nang hindi bumabalik.",
        icon: Users,
      },
      {
        name: 'SMS Marketing',
        detail: 'Text campaigns at automatic texts (thank-you, win-back, reward reminders) gamit ang sarili mong phone.',
        icon: MessageSquareText,
      },
    ],
  },
] as const

export const FEATURE_COUNT = FEATURE_GROUPS.reduce((count, group) => count + group.features.length, 0)

export interface FunnelBonus {
  label: string
  title: string
  detail: string
  /** A real price only; bonuses without one show "FREE" alone. */
  value?: number
  tag: string
  isSixMonthOnly: boolean
}

export const BONUSES: readonly FunnelBonus[] = [
  {
    label: 'Bonus 1',
    title: 'Done-for-you setup',
    detail: "Kami ang mag-aayos ng menu, branding, combos, upsells, stamp card at payment options mo, para ready ka na agad.",
    value: SETUP_FEE_WAIVED,
    tag: '6-month plan only',
    isSixMonthOnly: true,
  },
  {
    label: 'Bonus 2',
    title: 'SmartMenu University',
    detail: 'Step-by-step video lessons sa pricing, menu at marketing, napapanood mismo sa admin mo para alam mo ang next move.',
    tag: 'Kasama sa lahat ng plans',
    isSixMonthOnly: false,
  },
] as const
