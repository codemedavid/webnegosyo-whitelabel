export const CHECKOUT_URL = '/checkout'

/**
 * Barangay court at night. The ground is asphalt under floodlight, the light
 * sources are LED segments and printed vinyl. Every value here is a surface in
 * that scene — nothing is a generic UI token.
 */
export const COURT = {
  /** Asphalt in shadow. Green-cast, never neutral black. */
  ground: '#0A0E0C',
  /** Asphalt inside the floodlight pool. */
  groundLit: '#111714',
  /** The steel scoreboard housing. */
  steel: '#1A211D',
  /** Painted court line / chalk. Reads as the page's "white". */
  lane: '#EDE8DA',
  /** Painted line worn down — secondary text on the court. */
  laneDim: '#8E9A90',
  /** Scoring LED. Bright enough for large figures on the away side. */
  ledRed: '#FF2E12',
  /** The same red as printed stock. Cream text on this clears 4.5:1, which
   *  the LED red does not — so every button uses this, never ledRed. */
  plateRed: '#C9210A',
  plateRedDeep: '#8E1400',
  /** Clock and period LED. */
  ledAmber: '#FFB300',
  /** Home side LED — the merchant's own total. */
  ledGreen: '#17C964',
} as const

/**
 * Sponsor tarpaulin stock. Philippine banner printing is high-key CMYK on
 * vinyl — these are the inks, and they are meant to be loud against the court.
 */
export const TARP = {
  blue: '#0057D9',
  yellow: '#FFC800',
  red: '#C4002A',
  green: '#00A94F',
  vinyl: '#F5F1E6',
  ink: '#0A0E0C',
} as const

export const PRICE_LABEL = '₱3,899'
/** Digits only — the segment display renders the peso sign as its own glyph. */
export const PRICE_DIGITS = '3,899'

/** One-sentence answer to "ano ba talaga ito?" — used in the hero and the meta description. */
export const PRODUCT_ONE_LINER =
  'Sarili mong online ordering website na kusang nag-uupsell — para tumaas ang bawat order mo kahit tulog ka.'

/**
 * The hero board's demonstration run. Synthetic figures illustrating the
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
  /** The away side's scoring run — what the leak is called, not a list number. */
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

export type TarpInk = keyof typeof TARP

export interface Capability {
  icon: CapabilityIcon
  title: string
  body: string
  /** Vinyl stock this panel is printed on. */
  ink: TarpInk
  /** Panels on a real tarp wall are not the same size. */
  span: 'wide' | 'tall' | 'normal'
}

/** The core "here is literally what you get" wall — the clarity centerpiece of the page. */
export const CAPABILITIES: readonly Capability[] = [
  {
    icon: 'store',
    title: 'Sarili mong ordering website',
    body: 'Sariling link (yourbrand.webnegosyo.com o custom domain) na may buong menu, photos, at checkout. Hindi ka nakikitira sa food app.',
    ink: 'blue',
    span: 'wide',
  },
  {
    icon: 'sparkles',
    title: 'Upsell engine na automated',
    body: '"Perfect with…" pairings, "Make it a meal" upgrades, at checkout suggestions na tumatakbo sa bawat order — walang kailangang tandaan ang staff.',
    ink: 'red',
    span: 'tall',
  },
  {
    icon: 'layers',
    title: 'Bundles at combo builder',
    body: 'Gumawa ng combos na may savings badge. Fixed price o percentage off — ipapakita sa tamang bahagi ng order.',
    ink: 'yellow',
    span: 'normal',
  },
  {
    icon: 'truck',
    title: 'Dine-in, pick-up at delivery',
    body: 'QR ordering sa mesa, pick-up scheduling, at delivery na may distance-based fee o Lalamove booking. Isang system, lahat ng order type.',
    ink: 'vinyl',
    span: 'normal',
  },
  {
    icon: 'gauge',
    title: 'Live order dashboard',
    body: 'Real-time order queue na may tunog at notification, order status, at daily sales — sa web at sa merchant mobile app.',
    ink: 'green',
    span: 'normal',
  },
  {
    icon: 'palette',
    title: 'Fully branded sa iyo',
    body: 'Sariling logo, kulay, at menu design mula sa 12 card templates. Mukhang ikaw ang may-ari — kasi ikaw nga.',
    ink: 'vinyl',
    span: 'normal',
  },
  {
    icon: 'wallet',
    title: 'Cash, GCash at bank transfer',
    body: 'Payment methods na ikaw ang may set. Puwedeng humingi ng proof of payment bago ma-confirm ang order.',
    ink: 'yellow',
    span: 'normal',
  },
  {
    icon: 'phone',
    title: 'Messenger auto-send',
    body: 'Bawat order, dumidiretso sa Facebook Messenger mo na naka-format na — walang detalyeng nawawala.',
    ink: 'blue',
    span: 'wide',
  },
] as const

export interface Step {
  /** Quarters of the setup game. The sequence itself is the information. */
  n: string
  title: string
  body: string
}

export const STEPS: readonly Step[] = [
  {
    n: '1ST',
    title: 'Ipadala mo ang menu mo',
    body: 'Photo, PDF, o kahit listahan lang sa chat. Kami na ang mag-e-encode ng categories, prices, variations, at add-ons.',
  },
  {
    n: '2ND',
    title: 'Ise-set up namin ang lahat',
    body: 'Branding, upsell pairs, bundles, delivery zones, at payment methods. Walang kailangang i-install sa iyo.',
  },
  {
    n: '3RD',
    title: 'Live ka within 48 hours',
    body: 'I-share mo ang link, i-print ang QR sa mesa. Pumapasok na ang orders — at kusa nang nag-uupsell ang menu mo.',
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
  },
] as const

/** The four figures on the board. `value` is rendered in seven-segment. */
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

/** Printed down the sponsor strip that rings the court. */
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
