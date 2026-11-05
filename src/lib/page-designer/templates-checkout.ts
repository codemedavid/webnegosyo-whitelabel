// ---------------------------------------------------------------------------
// Checkout starting designs, after "Standard". Phone-first, coloured by the
// builder theme (@text, @muted, @primary), which a designed checkout points at
// its own --co-* palette. Every one holds every checkout block, visible on
// every device, so each is publishable as-is.
// ---------------------------------------------------------------------------

import { badge, box, heading, iconList, listItem, section, text, widget } from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5, NodeStyle, Widget } from '@/lib/hero-builder/types'

import { block as kitBlock, blocks as kitBlocks, pageDesign, pageSection, type BlockSpec } from './template-kit'
import type { PageTemplate } from './templates'

const WIDE_WIDTH = 1080
const NARROW_WIDTH = 560
const GAP = 16

const block = (id: string, spec: BlockSpec = {}): Widget => kitBlock('checkout', id, spec)
const blocks = (ids: readonly string[], spec: Omit<BlockSpec, 'texts'> = {}): Widget[] => kitBlocks('checkout', ids, spec)

export const CHECKOUT_DETAILS = ['checkout.order_type', 'checkout.schedule', 'checkout.customer', 'checkout.loyalty'] as const
export const CHECKOUT_MONEY = ['checkout.summary', 'checkout.voucher', 'checkout.gov_discount'] as const
export const CHECKOUT_PAY = ['checkout.payment', 'checkout.sms_opt_in'] as const

/**
 * The Studio's Modern checkout: details and payment on the left, the order
 * and the button on the right; stacked on phones and tablets.
 */
function buildTwoColumns(): HeroDesignV5 {
  const page = section({
    label: 'Checkout — two columns',
    widths: [58, 42],
    style: { padding: box(32, 24, 48, 24), contentWidth: WIDE_WIDTH, gap: 28 },
    tablet: { stack: true, gap: GAP, padding: box(24, 16, 40, 16) },
    mobile: { stack: true, gap: GAP, padding: box(16, 12, 32, 12) },
    columns: [
      {
        style: { gap: GAP },
        widgets: [
          block('checkout.header'),
          block('checkout.store_closed'),
          block('checkout.order_type', { texts: { title: 'How would you like it?' } }),
          block('checkout.schedule'),
          block('checkout.customer', { texts: { title: 'Your details' } }),
          block('checkout.loyalty'),
          ...blocks(CHECKOUT_PAY),
        ],
      },
      {
        style: { gap: GAP },
        widgets: [
          block('checkout.summary', { texts: { title: 'Order summary' } }),
          ...blocks(['checkout.voucher', 'checkout.gov_discount']),
          block('checkout.place_order', { options: { card: true } }),
        ],
      },
    ],
  })
  return pageDesign([page], { parts: { p_card_radius: 'lg', p_card_shadow: 'sm' } })
}

const REASSURANCE: NodeStyle = { fontSize: 15, gap: 10, color: '@text' }

/** Today's order with a short list of reassurances right above the button. */
function buildTrust(): HeroDesignV5 {
  return pageDesign([
    pageSection('Checkout — trust', [
      block('checkout.header'),
      badge('Secure checkout', 'ShieldCheck', { fontSize: 13, fontWeight: 600, color: '@muted' }),
      block('checkout.store_closed'),
      ...blocks([...CHECKOUT_DETAILS, ...CHECKOUT_MONEY, ...CHECKOUT_PAY]),
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

/** The Studio's Minimal checkout: no cards, one calm column with hairlines between the steps. */
function buildMinimal(): HeroDesignV5 {
  const plain = { card: false, show_subtitle: false }
  return pageDesign(
    [
      pageSection(
        'Checkout — minimal',
        [
          block('checkout.header', { options: { show_subtitle: false } }),
          block('checkout.store_closed'),
          ...blocks(['checkout.order_type', 'checkout.schedule'], { options: plain }),
          block('checkout.customer', { options: { ...plain, variant: 'underlined' }, texts: { title: 'Your details' } }),
          block('checkout.loyalty'),
          RULE(),
          ...blocks(CHECKOUT_PAY, { options: plain }),
          RULE(),
          ...blocks(CHECKOUT_MONEY, { options: plain }),
          block('checkout.place_order', { options: { card: false } }),
        ],
        { width: NARROW_WIDTH, gap: 20 },
      ),
    ],
    {
      parts: {
        p_title_size: 'xl',
        p_title_weight: '700',
        p_title_letter: 'tight',
        p_option_shadow: 'none',
        p_divider_bw: '1',
        p_button_radius: 'pill',
      },
    },
  )
}

/** The order up top, so the customer sees what they are paying for first. */
function buildOrderFirst(): HeroDesignV5 {
  return pageDesign([
    pageSection('Checkout — order first', [
      block('checkout.header'),
      heading('Almost there!', 'h2', { fontSize: 28, fontWeight: 800, lineHeight: 1.15, color: '@text' }, { fontSize: 24 }),
      text('Here’s your order from {store}. Add your details and choose how to pay.', { fontSize: 16, color: '@muted' }),
      block('checkout.store_closed'),
      ...blocks(CHECKOUT_MONEY),
      ...blocks([...CHECKOUT_DETAILS, ...CHECKOUT_PAY]),
      block('checkout.place_order'),
    ]),
  ])
}

export const CHECKOUT_TEMPLATES: readonly PageTemplate[] = [
  {
    id: 'two-columns',
    name: 'Two columns (Modern)',
    description: 'The Studio’s Modern checkout: details on the left, the order and the button on the right on computers; one column on phones.',
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
    description: 'The Studio’s Minimal checkout: no cards, underlined answers and thin lines between the steps.',
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
