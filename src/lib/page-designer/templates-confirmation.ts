// ---------------------------------------------------------------------------
// Thank-you page starting designs, after "Standard". Phone-first, coloured by
// the store's theme (@text, @muted, @primary) so the --co-* look still leads.
// Every one keeps the three required blocks (status, Messenger, actions) and
// is publishable as-is. "Show when" lines only speak on a confirmed order —
// a lost order keeps the status block's own warning words.
// ---------------------------------------------------------------------------

import { PHOTOS, WHITE, WHITE_SOFT, box, darkOverlay, design, heading, iconList, listItem, photo, section, text } from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5, NodeStyle, Section, Widget } from '@/lib/hero-builder/types'

import { blockDef } from './blocks'
import { createPageBlock } from './design-blocks'
import type { PageTemplate } from './templates'

/** Narrow like the live page (max-w-2xl). */
const PAGE_WIDTH = 640
const PAGE_PADDING = box(24, 16, 40, 16)
const PAGE_PADDING_MOBILE = box(16, 12, 32, 12)
const GAP = 16

type Texts = Readonly<Record<string, string>>
type Options = Readonly<Record<string, string | boolean>>

function block(id: string, texts: Texts = {}, options: Options = {}): Widget {
  const def = blockDef(id)
  if (!def) throw new Error(`Unknown confirmation block ${id}`)
  const widget = createPageBlock(def)
  return { ...widget, content: { ...widget.content, texts: { ...texts }, options: { ...widget.content.options, ...options } } }
}

/** Only on an order the store received ("Show when: Order sent"). */
const onSuccess = (widget: Widget): Widget => ({ ...widget, showWhen: ['success'] })

function pageSection(label: string, widgets: Widget[], style: NodeStyle = {}): Section {
  return section({
    label,
    widths: [100],
    style: { padding: PAGE_PADDING, contentWidth: PAGE_WIDTH, gap: GAP, ...style },
    tablet: { padding: PAGE_PADDING },
    mobile: { stack: true, gap: GAP, padding: PAGE_PADDING_MOBILE },
    columns: [{ style: { gap: GAP }, widgets }],
  })
}

const centred = (style: NodeStyle): NodeStyle => ({ textAlign: 'center', ...style })

/** A food photo with a big "Salamat!" on top, then the order. */
function buildCelebrate(): HeroDesignV5 {
  const banner = section({
    label: 'Thank you — banner',
    widths: [100],
    style: {
      padding: box(64, 20, 56, 20),
      contentWidth: PAGE_WIDTH,
      gap: 10,
      background: { type: 'image', color: '#1c1917', image: { url: photo(PHOTOS.feast, 1600), size: 'cover', position: 'center' }, overlay: darkOverlay(55) },
    },
    mobile: { stack: true, gap: 8, padding: box(44, 16, 36, 16) },
    columns: [
      {
        style: { gap: 10, textAlign: 'center', color: WHITE },
        widgets: [
          heading('Salamat, {name}!', 'h1', centred({ fontSize: 52, fontWeight: 800, lineHeight: 1.05, color: WHITE }), { fontSize: 38 }),
          text('{store} has your order. We’ll get cooking.', centred({ fontSize: 18, color: WHITE_SOFT }), { fontSize: 16 }),
        ],
      },
    ],
  })
  return design([
    { ...banner, showWhen: ['success'] },
    pageSection('Thank you — order', [
      block('confirmation.status', { title: 'Order sent', subtitle: 'Total {total} · {order_type}' }, { show_icon: false }),
      block('confirmation.summary'),
      block('confirmation.payment'),
      block('confirmation.messenger'),
      block('confirmation.actions'),
    ]),
  ])
}

/** Just the answer: sent, how to pay, where to track. */
function buildMinimal(): HeroDesignV5 {
  return design([
    pageSection('Thank you — minimal', [
      block('confirmation.status', { title: 'Thank you!', subtitle: '{store} has your order.' }),
      block('confirmation.payment', { title: 'How to pay' }),
      block('confirmation.messenger'),
      block('confirmation.actions', { track: 'Track my order' }, { show_back: false }),
    ], { gap: 12 }),
  ])
}

/** What happens next, step by step — for pickup counters. */
function buildPickupSteps(): HeroDesignV5 {
  return design([
    pageSection('Thank you — pickup', [
      block('confirmation.status'),
      onSuccess(heading('What happens next', 'h2', centred({ fontSize: 24, fontWeight: 700, color: '@text' }), { fontSize: 21 })),
      onSuccess(iconList(
        [
          listItem('CheckCircle2', 'We confirm your order — watch the tracking page.'),
          listItem('ChefHat', 'Our kitchen starts cooking it fresh.'),
          listItem('Store', 'Come to the counter when it says Ready.'),
          listItem('Wallet', 'Show your payment or pay at the counter.'),
        ],
        'vertical',
        { fontSize: 16, lineHeight: 1.5, color: '@text', accentColor: '@primary' },
      )),
      block('confirmation.actions', { track: 'Watch my order' }),
      block('confirmation.payment'),
      block('confirmation.summary'),
      block('confirmation.customer'),
      block('confirmation.messenger'),
    ]),
  ])
}

/** The receipt first, on a quiet card-like column — for delivery stores. */
function buildReceipt(): HeroDesignV5 {
  return design([
    pageSection('Thank you — receipt', [
      block('confirmation.status', { title: 'Order received', subtitle: 'We’ve sent it to {store}. Keep this page as your receipt.' }),
      onSuccess(iconList(
        [listItem('Truck', 'Delivery orders: we’ll text you when the rider is on the way.'), listItem('Clock', 'Pickup orders: check the tracking page for your ready time.')],
        'vertical',
        { fontSize: 15, lineHeight: 1.5, color: '@muted', accentColor: '@primary' },
      )),
      block('confirmation.summary', { title: 'Your receipt' }),
      block('confirmation.customer', { title: 'Deliver to' }),
      block('confirmation.payment'),
      block('confirmation.messenger'),
      block('confirmation.actions'),
    ]),
  ])
}

export const CONFIRMATION_TEMPLATES: readonly PageTemplate[] = [
  {
    id: 'celebrate',
    name: 'Celebrate',
    description: 'A food photo with a big “Salamat!” and the customer’s name. Swap in your own shot.',
    category: 'branded',
    build: buildCelebrate,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Just the answer: the order is in, how to pay, and one button to track it.',
    category: 'simple',
    build: buildMinimal,
  },
  {
    id: 'pickup-steps',
    name: 'Pickup steps',
    description: 'Tells customers exactly what happens next, step by step — great for pickup counters.',
    category: 'friendly',
    build: buildPickupSteps,
  },
  {
    id: 'receipt',
    name: 'Receipt first',
    description: 'The order and delivery details up top, so customers keep the page as their receipt.',
    category: 'simple',
    build: buildReceipt,
  },
]
