export const CHECKOUT_URL = '/checkout'

/**
 * SmartMenu brand identity, taken straight from the logo lockup:
 * the red wordmark, the amber sun and spoon, ink lettering on a warm cream
 * plate, endorsed "by WebNegosyo".
 */
export const BRAND = {
  name: 'SmartMenu',
  byline: 'by WebNegosyo',
  tagline: 'Growing restaurants. Together.',
  logoSrc: '/landing/smartmenu-logo.png',
} as const

/**
 * The palette is pulled from the logo and from the darkened photography the
 * page is built on — not from a generic UI kit. `night` is the shadow tone the
 * photos settle into once they are darkened for text.
 */
export const SMARTMENU = {
  /** Signal red of the SM monogram — primary action color. */
  red: '#D7261D',
  /** Red pressed into shadow, for hover and depth. */
  redDeep: '#A31510',
  /** The sun and spoon — accent and highlight. */
  amber: '#F5A623',
  /** Ink of the "Smart" lettering — headings and footer ground. */
  ink: '#1C1613',
  /** The plate the logo sits on — the page's light background. */
  cream: '#FBF6ED',
  /** Cream one step deeper, for cards sitting on cream. */
  creamDeep: '#F3EADB',
  /** Warm near-black the darkened photos settle into. */
  night: '#14100D',
  /** Body text on cream. */
  cocoa: '#4A3F37',
  /** Muted text on night. */
  parchment: '#D9CFC2',
  /** Confirmation green, used sparingly (savings, checkmarks). */
  green: '#1F9D55',
} as const

export interface LandingPhoto {
  src: string
  alt: string
}

/**
 * Every photograph the page uses. Real food and real dining rooms — the whole
 * point of the redesign is that the page has actually met a restaurant.
 * Files live in public/landing/photos (Unsplash license).
 */
export const LANDING_PHOTOS = {
  heroTable: {
    src: '/landing/photos/hero-table.jpg',
    alt: 'Candlelit restaurant table with a plated dish being served',
  },
  burger: {
    src: '/landing/photos/burger.jpg',
    alt: 'Cheeseburger with a side of fries on a wooden board',
  },
  barkada: {
    src: '/landing/photos/kitchen-pass.jpg',
    alt: 'Friends sharing burgers and fries around a table, seen from above',
  },
  cafe: {
    src: '/landing/photos/spread.jpg',
    alt: 'Busy neighborhood cafe with customers at wooden tables',
  },
  counter: {
    src: '/landing/photos/payment.jpg',
    alt: 'Customer paying with a phone at a shop counter',
  },
  paella: {
    src: '/landing/photos/noodles.jpg',
    alt: 'Pan of seafood rice with lemon wedges and herbs',
  },
  plated: {
    src: '/landing/photos/plated.jpg',
    alt: 'Fresh salad and a glass of orange juice on a dark table',
  },
  seafood: {
    src: '/landing/photos/rice-bowl.jpg',
    alt: 'Grilled seafood platter with salad and dipping sauce',
  },
  interior: {
    src: '/landing/photos/interior.jpg',
    alt: 'Moody restaurant dining room with warm wood and low light',
  },
  pizza: {
    src: '/landing/photos/pizza.jpg',
    alt: 'Sliced pizza with fresh herbs on a wooden serving board',
  },
} as const satisfies Record<string, LandingPhoto>

export const PRICE_LABEL = '₱3,899'

/** One-sentence answer to "ano ba talaga ito?" — used in the hero and the meta description. */
export const PRODUCT_ONE_LINER =
  'Sarili mong online ordering website na kusang nag-uupsell — para tumaas ang bawat order mo kahit tulog ka.'

/**
 * The hero receipt's demonstration run. Synthetic figures illustrating the
 * mechanism on one order — not a performance claim. Labelled as such on screen.
 */
export const DEMO_ORDER = {
  base: 149,
  plays: [
    { label: 'Pares', detail: 'Regular Fries', amount: 59 },
    { label: 'Meal', detail: 'Make it a meal', amount: 89 },
    { label: 'Bundle', detail: 'Barkada add-on', amount: 120 },
  ],
} as const

export const DEMO_ORDER_TOTAL =
  DEMO_ORDER.base + DEMO_ORDER.plays.reduce((sum, play) => sum + play.amount, 0)

export interface ProblemCard {
  label: string
  title: string
  body: string
}

export const PROBLEMS: readonly ProblemCard[] = [
  {
    label: 'Manual',
    title: 'Nasa Messenger pa rin ang orders mo',
    body: 'Manual na pag-reply, screenshot ng menu, at "ma\'am available po ba?" — nauubos ang oras mo sa pag-encode imbes na sa pagluluto.',
  },
  {
    label: 'Nakalimutan',
    title: 'Walang nag-a-upsell kapag busy',
    body: 'Nakakalimutan ng staff mag-offer ng fries, drinks, o upgrade. Bawat nakalimutang suggestion, tubo na hindi mo nakuha.',
  },
  {
    label: 'Komisyon',
    title: 'Umaarkila ka ng menu sa food apps',
    body: '20–30% commission bawat order, at hindi mo pag-aari ang customer data. Ikaw ang nagluluto, sila ang kumikita.',
  },
] as const

export type CapabilityIcon =
  | 'store'
  | 'sparkles'
  | 'layers'
  | 'truck'
  | 'gauge'
  | 'palette'
  | 'wallet'
  | 'phone'

export interface Capability {
  icon: CapabilityIcon
  title: string
  body: string
}

/** The core "here is literally what you get" wall — the clarity centerpiece of the page. */
export const CAPABILITIES: readonly Capability[] = [
  {
    icon: 'store',
    title: 'Sarili mong ordering website',
    body: 'Sariling link (yourbrand.webnegosyo.com o custom domain) na may buong menu, photos, at checkout. Hindi ka nakikitira sa food app.',
  },
  {
    icon: 'sparkles',
    title: 'Upsell engine na automated',
    body: '"Perfect with…" pairings, "Make it a meal" upgrades, at checkout suggestions na tumatakbo sa bawat order — walang kailangang tandaan ang staff.',
  },
  {
    icon: 'layers',
    title: 'Bundles at combo builder',
    body: 'Gumawa ng combos na may savings badge. Fixed price o percentage off — ipapakita sa tamang bahagi ng order.',
  },
  {
    icon: 'truck',
    title: 'Dine-in, pick-up at delivery',
    body: 'QR ordering sa mesa, pick-up scheduling, at delivery na may distance-based fee o Lalamove booking. Isang system, lahat ng order type.',
  },
  {
    icon: 'gauge',
    title: 'Live order dashboard',
    body: 'Real-time order queue na may tunog at notification, order status, at daily sales — sa web at sa merchant mobile app.',
  },
  {
    icon: 'palette',
    title: 'Fully branded sa iyo',
    body: 'Sariling logo, kulay, at menu design mula sa 12 card templates. Mukhang ikaw ang may-ari — kasi ikaw nga.',
  },
  {
    icon: 'wallet',
    title: 'Cash, GCash at bank transfer',
    body: 'Payment methods na ikaw ang may set. Puwedeng humingi ng proof of payment bago ma-confirm ang order.',
  },
  {
    icon: 'phone',
    title: 'Messenger auto-send',
    body: 'Bawat order, dumidiretso sa Facebook Messenger mo na naka-format na — walang detalyeng nawawala.',
  },
] as const

export interface Step {
  n: string
  title: string
  body: string
  photo: LandingPhoto
}

export const STEPS: readonly Step[] = [
  {
    n: '01',
    title: 'Ipadala mo ang menu mo',
    body: 'Photo, PDF, o kahit listahan lang sa chat. Kami na ang mag-e-encode ng categories, prices, variations, at add-ons.',
    photo: LANDING_PHOTOS.paella,
  },
  {
    n: '02',
    title: 'Ise-set up namin ang lahat',
    body: 'Branding, upsell pairs, bundles, delivery zones, at payment methods. Walang kailangang i-install sa iyo.',
    photo: LANDING_PHOTOS.counter,
  },
  {
    n: '03',
    title: 'Live ka within 48 hours',
    body: 'I-share mo ang link, i-print ang QR sa mesa. Pumapasok na ang orders — at kusa nang nag-uupsell ang menu mo.',
    photo: LANDING_PHOTOS.cafe,
  },
] as const

export const PRICING_FEATURES = [
  'Sarili mong ordering website + link',
  'Automatic upsell engine (pairings + upgrades)',
  'Bundles at combo builder',
  'Dine-in QR, pick-up at delivery',
  'Live order dashboard + merchant app',
  'Menu at product management system',
  'Custom branding at 12 menu templates',
  'Messenger order forwarding',
  'Done-for-you setup within 48 hours',
  'Lifetime updates — walang monthly fee',
] as const

export const EXCLUSIONS = [
  'Monthly subscription',
  'Commission kada order',
  'Setup fee',
  'Lock-in contract',
] as const

export const FAQ_ITEMS = [
  {
    q: 'Ano ba talaga ang binibili ko?',
    a: 'Isang buong online ordering website para sa food business mo — kasama ang smart menu na nag-a-automate ng upsells, bundles, at upgrades, plus ang admin dashboard para sa orders at menu. One-time payment, sa iyo na habambuhay.',
  },
  {
    q: 'Kailangan ko ba ng technical skills?',
    a: 'Hindi. Kami ang gagawa ng buong setup — menu encoding, branding, upsells, at delivery settings. Ikaw, mag-manage lang ng orders. Kasingdali lang ng Facebook ang admin dashboard.',
  },
  {
    q: 'May monthly fee o commission ba kada order?',
    a: 'Wala. One-time ₱3,899 lang, walang commission kahit ilan ang orders mo. Kasama na ang lifetime updates at lahat ng features.',
  },
  {
    q: 'Gaano kabilis ma-setup?',
    a: 'Within 48 hours after payment, live na ang Smart Menu mo. Basta naipadala mo na ang menu at logo, kami na ang bahala sa technical setup.',
  },
  {
    q: 'Pang-dine-in lang ba ito?',
    a: 'Hindi — gumagana ito sa dine-in (QR sa mesa), pick-up, at delivery. Lahat ng upsell features, nandoon sa lahat ng order type.',
  },
  {
    q: 'Paano kung may sarili na akong page o food app account?',
    a: 'Magkasama sila. Ang Smart Menu ang magiging sarili mong channel na walang commission — puwede mo pa ring gamitin ang Messenger at food apps habang unti-unting inililipat ang suki mo sa link mo.',
  },
  {
    q: 'Paano kung hindi gumana sa business ko?',
    a: 'Kung may menu ka, gumagana ito. Bundles, upgrades, at upsells ay nag-a-apply sa lahat ng cuisine at order type — milk tea, burgers, lutong bahay, o catering.',
  },
] as const

export type JourneyMock = 'pairing' | 'upgrade' | 'bundle'

export interface JourneyFeature {
  /** Where in the customer's order this play runs. */
  when: string
  title: string
  body: string
  points: readonly string[]
  mock: JourneyMock
  /** What this play adds to the demo order, in pesos. */
  adds: number
  photo: LandingPhoto
  /** Surface color of this feature's full-bleed tab panel. */
  surface: string
}

export const JOURNEY_FEATURES: readonly JourneyFeature[] = [
  {
    when: 'Pagkatapos mag-add to cart',
    title: 'Bawat order, may kasamang suggestion.',
    body: 'Pagka-add ng customer sa cart, ang Smart Menu na ang nagmumungkahi ng perfect pairing — fries sa burger, drink sa meal. Walang staff na kailangang mag-alala.',
    points: [
      '"Perfect with…" pairings pagkatapos mag-add to cart',
      'Ranked ayon sa aling pares ang talagang bumebenta',
      'Gumagana sa dine-in, pick-up, at delivery',
    ],
    mock: 'pairing',
    adds: 59,
    photo: LANDING_PHOTOS.burger,
    surface: SMARTMENU.red,
  },
  {
    when: 'Sa product page',
    title: 'Ala carte? Ginagawa naming meal.',
    body: 'Kiosk-style upgrade prompt na side-by-side ang comparison — kita agad ng customer kung magkano ang dagdag at ano ang kasama. Isang tap, mas malaki na ang order.',
    points: [
      'Side-by-side na Ala Carte vs Meal cards',
      'One-tap meal conversion sa product page',
      'Sarili mong labels at pricing bawat upgrade',
    ],
    mock: 'upgrade',
    adds: 89,
    photo: LANDING_PHOTOS.seafood,
    surface: SMARTMENU.amber,
  },
  {
    when: 'Sa taas ng menu',
    title: 'Bundles na kusang bumebenta.',
    body: 'Curated combos na may savings badge — nasa taas ng menu mo at sinusuggest kapag may kaugnay na item sa cart. Set once, sell forever.',
    points: [
      'Savings badge na nagpapakita ng tipid',
      'Fixed price o percentage-off na pricing',
      'Auto-suggest kapag bumibili ng kasamang item',
    ],
    mock: 'bundle',
    adds: 120,
    photo: LANDING_PHOTOS.barkada,
    surface: SMARTMENU.green,
  },
] as const

export const STATS = [
  { value: '100+', label: 'Restaurants onboard' },
  { value: '48', unit: 'HRS', label: 'Payment to live' },
  { value: '0', unit: '%', label: 'Commission kada order' },
  { value: '0', unit: '₱/BUWAN', label: 'Monthly fees, forever' },
] as const

export const HERO_TRUST_POINTS = [
  'One-time payment',
  'Walang commission',
  'Done-for-you setup',
  'Lifetime updates',
] as const

/** Printed down the capability ribbon under the hero. */
export const SPONSOR_STRIP = [
  'Ordering Website',
  'Automatic Upsells',
  'Make It a Meal',
  'Smart Bundles',
  'Dine-in QR',
  'Pick-up',
  'Delivery',
  'Live Order Dashboard',
  'Messenger Orders',
  'No Monthly Fees',
  '48-Hour Setup',
] as const

export const NAV_LINKS = [
  { href: '#what-you-get', label: 'What You Get' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const
