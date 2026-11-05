// ---------------------------------------------------------------------------
// Checkout starting designs, after "Standard". Phone-first, coloured by the
// builder theme (@text, @muted, @primary), which a designed checkout points at
// its own --co-* palette. Every one holds every checkout block, required ones
// visible on every device, so each is publishable as-is.
// ---------------------------------------------------------------------------

import { badge, box, design, heading, iconList, listItem, section, text, widget } from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5, NodeStyle, Section, Widget } from '@/lib/hero-builder/types'

import { blockDef } from './blocks'
import { createPageBlock } from './design-blocks'
import type { PageTemplate } from './templates'

const PAGE_WIDTH = 720
const WIDE_WIDTH = 1080
const NARROW_WIDTH = 560
const PAGE_PADDING = box(24, 16, 40, 16)
const PAGE_PADDING_MOBILE = box(16, 12, 32, 12)
const GAP = 16

type Options = Readonly<Record<string, string | boolean>>

function block(id: string, options: Options = {}): Widget {
  const def = blockDef(id)
  if (!def || def.page !== 'checkout') throw new Error(`Unknown checkout block ${id}`)
  const w = createPageBlock(def)
  return { ...w, content: { ...w.content, options: { ...w.content.options, ...options } } }
}

/** Each block with the options it has (a block never carries a setting it doesn't use). */
const blocks = (ids: readonly string[], options: Options = {}): Widget[] =>
  ids.map((id) => {
    const keys = new Set(blockDef(id)?.options.map((o) => o.key) ?? [])
    return block(id, Object.fromEntries(Object.entries(options).filter(([key]) => keys.has(key))))
  })

function pageSection(label: string, widgets: Widget[], width = PAGE_WIDTH, gap = GAP): Section {
  return section({
    label,
    widths: [100],
    style: { padding: PAGE_PADDING, contentWidth: width, gap },
    tablet: { padding: PAGE_PADDING },
    mobile: { stack: true, gap, padding: PAGE_PADDING_MOBILE },
    columns: [{ style: { gap }, widgets }],
  })
}

const DETAILS = ['checkout.order_type', 'checkout.schedule', 'checkout.customer', 'checkout.loyalty'] as const
const MONEY = ['checkout.summary', 'checkout.voucher', 'checkout.gov_discount'] as const
const PAY = ['checkout.payment', 'checkout.sms_opt_in'] as const

/** Details and payment on the left, the order and the button on the right; stacked on phones and tablets. */
function buildTwoColumns(): HeroDesignV5 {
  const page = section({
    label: 'Checkout — two columns',
    widths: [58, 42],
    style: { padding: box(32, 24, 48, 24), contentWidth: WIDE_WIDTH, gap: 28 },
    tablet: { stack: true, gap: GAP, padding: box(24, 16, 40, 16) },
    mobile: { stack: true, gap: GAP, padding: PAGE_PADDING_MOBILE },
    columns: [
      { style: { gap: GAP }, widgets: [block('checkout.header'), block('checkout.store_closed'), ...blocks([...DETAILS, ...PAY])] },
      { style: { gap: GAP }, widgets: [...blocks(MONEY), block('checkout.place_order', { card: true })] },
    ],
  })
  return design([page])
}

const REASSURANCE: NodeStyle = { fontSize: 15, gap: 10, color: '@text' }

/** Today's order with a short list of reassurances right above the button. */
function buildTrust(): HeroDesignV5 {
  return design([
    pageSection('Checkout — trust', [
      block('checkout.header'),
      badge('Secure checkout', 'ShieldCheck', { fontSize: 13, fontWeight: 600, color: '@muted' }),
      block('checkout.store_closed'),
      ...blocks([...DETAILS, ...MONEY, ...PAY]),
      iconList(
        [
          listItem('Store', 'Your order goes straight to {store}'),
          listItem('Clock', 'Follow it live as soon as it’s placed'),
          listItem('CheckCircle2', 'Check your order above before you send it'),
        ],
        'vertical',
        REASSURANCE,
      ),
      block('checkout.place_order'),
    ]),
  ])
}

const RULE = (): Widget => widget('divider', {}, { size: 1, accentColor: '@muted', margin: box(4, 0) })

/** No cards: one quiet column with thin rules between the steps. */
function buildMinimal(): HeroDesignV5 {
  const plain = { card: false }
  return design([
    pageSection(
      'Checkout — minimal',
      [
        block('checkout.header', { show_subtitle: false }),
        block('checkout.store_closed'),
        ...blocks(DETAILS, { ...plain, show_subtitle: false }),
        RULE(),
        ...blocks(MONEY, { ...plain, show_subtitle: false }),
        RULE(),
        ...blocks(PAY, { ...plain, show_subtitle: false }),
        block('checkout.place_order', plain),
      ],
      NARROW_WIDTH,
      20,
    ),
  ])
}

/** The order up top, so the customer sees what they are paying for first. */
function buildOrderFirst(): HeroDesignV5 {
  return design([
    pageSection('Checkout — order first', [
      block('checkout.header'),
      heading('Almost there!', 'h2', { fontSize: 28, fontWeight: 800, lineHeight: 1.15, color: '@text' }, { fontSize: 24 }),
      text('Here’s your order from {store}. Add your details and choose how to pay.', { fontSize: 16, color: '@muted' }),
      block('checkout.store_closed'),
      ...blocks(MONEY),
      ...blocks([...DETAILS, ...PAY]),
      block('checkout.place_order'),
    ]),
  ])
}

export const CHECKOUT_TEMPLATES: readonly PageTemplate[] = [
  {
    id: 'two-columns',
    name: 'Two columns',
    description: 'Details on the left, the order and the button on the right on computers; one column on phones.',
    category: 'simple',
    build: buildTwoColumns,
  },
  {
    id: 'trust',
    name: 'Trust',
    description: 'A “secure checkout” badge and three reassurances right above Place order.',
    category: 'friendly',
    build: buildTrust,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'No cards, just a quiet column with thin lines between the steps.',
    category: 'simple',
    build: buildMinimal,
  },
  {
    id: 'order-first',
    name: 'Order first',
    description: 'Opens with “Almost there!” and the order summary, then details and payment.',
    category: 'branded',
    build: buildOrderFirst,
  },
]
