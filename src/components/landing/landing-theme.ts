export const CHECKOUT_URL = '/checkout'

export const LANDING_COLORS = {
  brand: '#ea580c',
  brandDeep: '#9a3412',
  gold: '#f59e0b',
  ink: '#060403',
  inkSoft: '#0d0906',
  cream: '#faf6f1',
} as const

export const PRICE_LABEL = '₱3,899'

export const PRICING_FEATURES = [
  'Website Ordering — This is your smart menu',
  'Upselling System',
  'Bundles System',
  'Product Management System',
  'Dine-in, Pick-up & Delivery',
  'Mobile-First Ordering Flow',
  'Lifetime Updates',
] as const

export const FAQ_ITEMS = [
  {
    q: 'Kailangan ko ba ng technical skills?',
    a: 'Hindi. Lahat ng setup, kami ang gagawa. Ikaw, mag-manage lang ng orders at menu items. Parang Facebook lang ang admin dashboard.',
  },
  {
    q: 'Pang-dine-in lang ba ito?',
    a: 'Hindi — gumagana ang Smart Menu para sa dine-in, pick-up, at delivery. Lahat ng upsell features, nandoon sa lahat ng order type.',
  },
  {
    q: 'May monthly fee ba?',
    a: 'Wala. One-time payment lang ang ₱3,899. Kasama na ang lifetime updates at lahat ng features.',
  },
  {
    q: 'Gaano kabilis ma-setup?',
    a: 'Within 48 hours after payment, live na ang Smart Menu mo. We handle the technical setup para sa iyo.',
  },
  {
    q: 'Paano kung hindi gumana sa business ko?',
    a: 'Every food business na may menu — gumana ang Smart Menu. Bundles, upgrades, at upsells work across cuisines and order types.',
  },
] as const

export interface JourneyFeature {
  tag: string
  title: string
  body: string
  points: readonly string[]
  align: 'left' | 'right'
}

export const JOURNEY_FEATURES: readonly JourneyFeature[] = [
  {
    tag: '01 — Automatic Upsells',
    title: 'Bawat order, may kasamang suggestion.',
    body: 'Pagka-add ng customer sa cart, ang Smart Menu na ang magmumungkahi ng perfect pairing — fries sa burger, drink sa meal. Walang staff na kailangang mag-alala.',
    points: ['"Perfect with…" pairings', 'AI-ranked suggestions', 'Works on every order type'],
    align: 'left',
  },
  {
    tag: '02 — Make It a Meal',
    title: 'Ala carte? Ginagawa naming meal.',
    body: 'Kiosk-style upgrade prompts na side-by-side ang comparison. Isang tap lang, mas malaki na ang order — at mas busog ang customer.',
    points: ['Side-by-side upgrade cards', 'One-tap meal conversion', 'Custom labels at pricing'],
    align: 'right',
  },
  {
    tag: '03 — Bundles That Sell',
    title: 'Bundles na kusang bumebenta.',
    body: 'Curated combos with savings badges — displayed sa taas ng menu mo at sinusuggest pag tumaya ang customer ng kasamang item. Set once, sell forever.',
    points: ['Savings badges na nag-co-convert', 'Fixed o percentage pricing', 'Auto bundle suggestions'],
    align: 'left',
  },
] as const

export const STATS = [
  { value: '100+', label: 'Restaurants onboard' },
  { value: '48hrs', label: 'From payment to live' },
  { value: '₱0', label: 'Monthly fees, forever' },
  { value: '24/7', label: 'Menu that upsells itself' },
] as const

export const MARQUEE_ITEMS = [
  'Automatic Upsells',
  'Make It a Meal',
  'Smart Bundles',
  'Dine-in',
  'Pick-up',
  'Delivery',
  'No Monthly Fees',
  'Lifetime Updates',
  '48-Hour Setup',
] as const
