import {
  FEATURE_COUNT,
  FULL_PLAN_AT_MONTHLY,
  FULL_PLAN_MONTHS,
  FULL_PLAN_PER_MONTH,
  FULL_PLAN_SAVINGS,
  INSTALLMENT_BALANCE,
  INSTALLMENT_PRICE,
  INSTALLMENT_SAVINGS,
  MONTHLY_PRICE,
  SETUP_FEE_WAIVED,
  SIX_MONTH_PRICE,
  formatPeso,
} from './funnel-offer'

/**
 * Every word on /funnel, in Taglish: English for the promise, outcomes and
 * feature names, Tagalog for the transitions and feelings.
 *
 * The page pushes the six-month plan over the ₱1,499 monthly plan. The
 * headline price is ₱999 a month (the six-month plan paid monthly, what
 * anyone can start on today); paying in full is the best deal: 6 + 1 free
 * month for ₱5,499, about ₱786 a month. Only real claims: no invented
 * results, names, ratings or review counts.
 */

const MONTHLY = formatPeso(MONTHLY_PRICE)
const SIX = formatPeso(SIX_MONTH_PRICE)
const FULL_PER_MONTH = formatPeso(FULL_PLAN_PER_MONTH)
const FULL_SAVINGS = formatPeso(FULL_PLAN_SAVINGS)
const FULL_ANCHOR = formatPeso(FULL_PLAN_AT_MONTHLY)
const INSTALLMENT = formatPeso(INSTALLMENT_PRICE)
const INSTALLMENT_LEFT = formatPeso(INSTALLMENT_BALANCE)
const INSTALLMENT_SAVE = formatPeso(INSTALLMENT_SAVINGS)
const SETUP = formatPeso(SETUP_FEE_WAIVED)

export const COUNTDOWN = {
  label: '6-month deal ends in',
  shortLabel: 'Deal ends in',
  units: { days: 'Days', hours: 'Hours', minutes: 'Mins', seconds: 'Secs' },
  compactUnits: { days: 'd', hours: 'h', minutes: 'm', seconds: 's' },
} as const

export const HEADER = {
  cta: 'Get the deal',
} as const

export const HERO = {
  eyebrow: 'Para sa restaurants, cafés at food businesses',
  /** Rendered in order; `tone` picks the reference's highlight treatment. */
  title: [
    { text: 'More orders,', tone: 'plain' },
    { text: 'bigger orders', tone: 'highlight' },
    { text: 'at', tone: 'plain' },
    { text: 'more regulars', tone: 'highlight' },
    { text: 'sa isang system,', tone: 'red' },
    { text: `${INSTALLMENT} a month`, tone: 'amber' },
  ],
  lead: `Ordering website, POS, inventory, expense tracker, loyalty, SMS at analytics, magkakasama na. Hindi mo na kailangang mag-subscribe sa lima-limang apps, at 0% commission pa sa sarili mong orders.`,
  stats: [
    { value: '100+', label: 'food businesses onboarded' },
    { value: '48 hrs', label: 'para mag-live' },
  ],
  demoLabel: 'Watch demo',
  cta: 'Kunin ang 6-month deal',
  badgeLead: 'Bayad nang buo? 6 months + 1 FREE:',
  badgeValue: `${FULL_PLAN_MONTHS} months for ${SIX}`,
} as const

export const FEATURES = {
  eyebrow: 'Lahat ng makukuha mo',
  titleMarker: `${FEATURE_COUNT} tools`,
  titleRest: 'na dati hiwa-hiwalay mong binabayaran',
  subtitle: "Kasama lahat ng ito sa monthly man o 6-month plan. Walang add-on fees, walang per-order commission.",
  cta: 'Gusto ko na lahat ng ito',
} as const

export const PROOF = {
  eyebrow: 'Hindi lang puro claims',
  title: 'Tingnan mo muna ang system in action',
  demoTitle: 'SmartMenu in 2 minutes: easier ordering, bigger orders, more repeat customers',
  videoLabel: 'Merchant video testimonial',
  messageAlt: 'Screenshot of a real merchant message praising the hero banner of their SmartMenu store',
  reviewAlt: 'Real Facebook recommendation from a SmartMenu merchant',
  disclaimer:
    'Results will vary depende sa menu mo, effort mo at kung paano mo ginagamit ang system. Hindi kami nagpo-promise ng specific sales increase.',
} as const

export const BONUS_SECTION = {
  title: 'Kapag nag-6 months ka, makukuha mo rin:',
  free: 'FREE',
  cta: 'Kunin ang 6 months + bonuses',
} as const

export const HELPED = {
  eyebrow: 'Nakatulong na kami sa…',
  value: '100+',
  unit: 'food businesses',
  caption: 'na magkaroon ng sariling ordering system',
} as const

export const PLANS = {
  eyebrow: 'Piliin ang plan mo',
  titleLead: 'Mas sulit kapag',
  titleMarker: '6 months',
  subtitle: `Pareho ang system sa dalawang plan. Sa 6-month plan, free ang done-for-you setup at ${INSTALLMENT} a month ka lang. Bayaran mo nang buo, +1 month FREE: ${FULL_PLAN_MONTHS} months for ${SIX}.`,
  sixMonth: {
    ribbon: `Best value · 6 + 1 months · Save ${FULL_SAVINGS}`,
    name: '6 Months + 1 FREE',
    price: SIX,
    anchor: FULL_ANCHOR,
    perMonth: `${FULL_PLAN_MONTHS} months · ≈ ${FULL_PER_MONTH}/month`,
    points: [
      `Lahat ng ${FEATURE_COUNT} tools + SmartMenu University`,
      `+1 month FREE kapag bayad nang buo (${MONTHLY} value)`,
      `FREE done-for-you setup (${SETUP} value)`,
      'Live in 48 hours after namin matanggap ang menu at logo mo',
      `O ${INSTALLMENT} a month lang, 6 months`,
    ],
  },
  monthly: {
    name: 'Monthly',
    price: MONTHLY,
    unit: '/month',
    points: [
      `Lahat ng ${FEATURE_COUNT} tools + SmartMenu University`,
      'Month to month, cancel anytime: isang message lang sa amin',
    ],
    missing: ['Free done-for-you setup (6-month plan only)'],
  },
  paymentLegend: 'Paano mo babayaran ang 6 months?',
  payFull: { label: 'Bayad nang buo', amount: SIX, note: `today · ${FULL_PLAN_MONTHS} months (+1 FREE)` },
  payInstallment: { label: `${INSTALLMENT} a month`, amount: INSTALLMENT, note: `today · then ${INSTALLMENT}/month × 5` },
  sixMonthCta: 'Kunin ang 6 months',
  monthlyCta: 'Piliin ang monthly',
} as const

export const ORDER = {
  formTitle: 'Your details',
  summaryTitle: 'Order summary',
  dueToday: 'Due today',
  balance: 'Balance',
  setupLine: 'Done-for-you setup',
  sixMonthLine: 'SmartMenu · 6 months',
  bonusMonthLine: '+1 month FREE',
  installmentLine: 'SmartMenu · month 1 of 6',
  installmentBalance: 'Next 5 months',
  monthlyLine: 'SmartMenu · first month',
  sixMonthNote: `Sakop ang ${FULL_PLAN_MONTHS} months ng SmartMenu (6 + 1 FREE), mga ${FULL_PER_MONTH} a month lang.`,
  installmentNote: `${INSTALLMENT} today para sa first month, tapos ${INSTALLMENT} every month for 5 more months (${INSTALLMENT_LEFT}). Ime-message ka namin bago ang bawat bayad.`,
  monthlyNote: `Renews at ${MONTHLY}/month. Walang lock-in, cancel anytime.`,
  submitSixMonth: 'Kunin ang 6-month plan',
  submitMonthly: 'Start monthly',
  submitting: 'Sine-save ang order mo…',
  afterSubmit:
    'Pag-submit mo, makikita mo agad ang reference number at payment instructions. Once paid, ise-send namin ang 5-minute setup form.',
} as const

export const ORDER_FORM = {
  fields: {
    name: { label: 'Your name', placeholder: 'Juan dela Cruz', error: 'Ilagay ang full name mo.' },
    businessName: {
      label: 'Restaurant / business name',
      placeholder: "Juan's Kitchen",
      error: 'Ilagay ang pangalan ng business mo.',
    },
    phone: {
      label: 'Mobile number',
      placeholder: '09171234567',
      error: 'Maglagay ng valid 11-digit mobile number, example: 09171234567.',
    },
    email: { label: 'Email address', placeholder: 'juan@email.com', error: 'Maglagay ng valid email address.' },
  },
  paymentLegend: 'How would you like to pay?',
  paymentLoading: 'Loading payment options…',
  paymentLoadError: 'Hindi ma-load ang payment options. I-refresh ang page then try again.',
  paymentRequired: 'Pili muna kung paano mo gustong magbayad.',
  saveFailed: 'Hindi na-save ang details mo. Please try again.',
  connectionFailed: 'May connection problem. Check your internet then try again.',
} as const

export interface Guarantee {
  title: string
  body: string
}

/** Two promises the team honors by hand: one on speed, one on results. */
export const GUARANTEES: readonly Guarantee[] = [
  {
    title: 'Live in 48 Hours, or Your First Month Is Free',
    body: 'Pag natanggap na namin ang menu at logo mo, kami na ang bahala sa build. Kapag hindi live ang SmartMenu mo within 48 hours, libre ang first month mo.',
  },
  {
    title: 'First Online Order in 30 Days, or We Add a Month Free',
    body: 'Kapag wala ka pang natanggap na kahit isang online order sa SmartMenu mo within 30 days after mag-live, dadagdagan namin ng isang buwan ang plan mo, libre.',
  },
] as const

export const FAQ = {
  title: 'Baka ito rin ang tanong mo',
  items: [
    {
      q: 'Ano ang difference ng monthly at 6-month plan?',
      a: `Pareho ang system at features. Sa 6-month plan, free ang done-for-you setup at ${INSTALLMENT} a month ka lang instead of ${MONTHLY} (save ${INSTALLMENT_SAVE}). Kapag binayaran mo nang buo (${SIX}), +1 month FREE: ${FULL_PLAN_MONTHS} months, mga ${FULL_PER_MONTH} a month, save ka ng ${FULL_SAVINGS}.`,
    },
    {
      q: `Paano gumagana ang ${INSTALLMENT} a month?`,
      a: `${INSTALLMENT} lang today para sa first month, at masisimulan na namin ang setup mo. Tapos ${INSTALLMENT} every month for 5 more months. Ime-message ka namin bago ang bawat bayad.`,
    },
    {
      q: 'Ano ang guarantee ninyo?',
      a: 'Dalawa. Live ka within 48 hours after namin matanggap ang menu at logo mo, or libre ang first month mo. At kapag wala ka pang online order within 30 days after mag-live, dadagdagan namin ng isang buwan ang plan mo, libre.',
    },
    {
      q: 'May commission ba bawat order?',
      a: 'Wala po. Orders that go through your own SmartMenu have 0% commission. Ang plan mo lang ang binabayaran mo.',
    },
    {
      q: 'May setup fee ba?',
      a: `Normally ${SETUP} ang done-for-you setup, pero FREE po siya sa 6-month plan.`,
    },
    {
      q: 'May contract o lock-in ba?',
      a: `Ang monthly plan ay month to month lang: cancel anytime, isang message lang sa amin. Ang 6-month plan ay 6-month commitment (bayad nang buo, o ${INSTALLMENT} a month), kaya mas mura.`,
    },
    {
      q: 'Kailangan ko bang maging techy?',
      a: 'Hindi po. Ibigay mo lang ang basic business details sa 5-minute setup form, tapos kami na ang bahala sa build.',
    },
    {
      q: 'Paano ko matatanggap ang orders?',
      a: 'New orders ring sa merchant app mo sa Android o iPhone. Makikita mo rin sila sa web dashboard, at puwede ring pumasok sa Messenger kung gusto mo.',
    },
    {
      q: 'Nasa Grab o Foodpanda na ako. Kailangan ko pa ba nito?',
      a: 'Puwede mo silang gamitin side by side. Grab at Foodpanda help with discovery, habang ang SmartMenu gives your regulars a direct way to order through your own link, with 0% commission.',
    },
    {
      q: 'Gagana ba ito sa café, milk tea o carinderia?',
      a: 'Oo po. SmartMenu supports dine-in QR ordering, pick-up at delivery, kaya puwede sa restaurants, cafés, milk tea shops, carinderias, food stalls at cloud kitchens.',
    },
    {
      q: 'Paano ako magbabayad?',
      a: 'Pag-submit mo ng form, makikita mo ang reference number at complete payment instructions para sa napili mong payment method.',
    },
  ],
} as const

export const CLOSE = {
  label: 'Huling tawag',
  title: 'I-claim ang 6-month deal mo',
  body: `${FULL_PLAN_MONTHS} months for ${SIX} (6 + 1 FREE), free done-for-you setup, at live in 48 hours. O kaya ${INSTALLMENT} a month lang.`,
  cta: 'Kunin ang 6 months',
} as const

export const STICKY = {
  title: '6 months',
  price: `${INSTALLMENT}/mo`,
  note: `o ${FULL_PLAN_MONTHS} months for ${SIX} · free setup`,
  cta: 'Get the deal',
} as const

export const FOOTER = {
  blurb:
    'SmartMenu by WebNegosyo: ang growth system para sa Philippine restaurants at food businesses na gusto ng more orders, bigger orders at more repeat customers.',
  links: [
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/support', label: 'Support' },
  ],
} as const
