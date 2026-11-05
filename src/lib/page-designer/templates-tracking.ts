// ---------------------------------------------------------------------------
// Order-tracking starting designs, after "Standard". Phone-first, coloured by
// the store's theme (@text, @muted, @primary) so the --trk-* look still leads.
// Every one keeps the pickup code and the loyalty card (some stores run their
// counter on them), and is publishable as-is.
// ---------------------------------------------------------------------------

import { PHOTOS, WHITE, WHITE_SOFT, box, darkOverlay, design, heading, photo, section, text } from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5, NodeStyle, Section, Widget } from '@/lib/hero-builder/types'

import { blockDef } from './blocks'
import { createPageBlock } from './design-blocks'
import type { PageTemplate } from './templates'

/** Narrow like the live page (max-w-lg). */
const PAGE_WIDTH = 560
const PAGE_PADDING = box(24, 16, 40, 16)
const PAGE_PADDING_MOBILE = box(16, 12, 32, 12)
const GAP = 16

type Texts = Readonly<Record<string, string>>
type Options = Readonly<Record<string, string | boolean>>

function block(id: string, texts: Texts = {}, options: Options = {}): Widget {
  const def = blockDef(id)
  if (!def) throw new Error(`Unknown tracking block ${id}`)
  const widget = createPageBlock(def)
  return { ...widget, content: { ...widget.content, texts: { ...texts }, options: { ...widget.content.options, ...options } } }
}

/** Shown only while the order is in one of `states` ("Show when"). */
function onlyWhen(widget: Widget, states: readonly string[]): Widget {
  return { ...widget, showWhen: [...states] }
}

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

/** A greeting and one line per stage, above today's blocks. */
function buildFriendly(): HeroDesignV5 {
  const stageLine = (words: string, states: readonly string[]) =>
    onlyWhen(text(words, centred({ fontSize: 17, lineHeight: 1.5, color: '@muted' }), { fontSize: 15 }), states)
  return design([
    pageSection('Order — friendly', [
      block('tracking.header'),
      heading('Salamat, {name}!', 'h1', centred({ fontSize: 34, fontWeight: 800, lineHeight: 1.15, color: '@text' }), { fontSize: 28 }),
      stageLine('We got your order and we’re checking it now.', ['pending', 'confirmed']),
      stageLine('Our kitchen is cooking it fresh. Hang tight!', ['preparing']),
      stageLine('It’s ready! Come say hi at the counter.', ['ready']),
      stageLine('Enjoy your meal — see you again soon!', ['delivered']),
      stageLine('Sorry, this order couldn’t go through. Message us and we’ll sort it out.', ['cancelled']),
      block('tracking.status', { greeting: 'Order {order_number}', greeting_guest: 'Order {order_number}' }),
      block('tracking.ring_me'),
      block('tracking.pickup_qr'),
      block('tracking.loyalty'),
      block('tracking.timeline'),
      block('tracking.summary'),
      block('tracking.back'),
    ]),
  ])
}

/** Just the answer: status, the code, the receipt. No timeline, no live badge. */
function buildMinimal(): HeroDesignV5 {
  return design([
    pageSection('Order — minimal', [
      block('tracking.header', {}, { show_live_badge: false }),
      block('tracking.status'),
      block('tracking.ring_me'),
      block('tracking.pickup_qr'),
      block('tracking.summary', { title: 'Order {order_number}' }),
      block('tracking.loyalty'),
      text('This page updates by itself — no need to refresh.', centred({ fontSize: 13, color: '@muted' })),
      block('tracking.back'),
    ], { gap: 12 }),
  ])
}

/** A photo banner with the store's name on top, then the order. */
function buildBrandedBanner(): HeroDesignV5 {
  const banner = section({
    label: 'Order — banner',
    widths: [100],
    style: {
      padding: box(56, 20, 48, 20),
      contentWidth: PAGE_WIDTH,
      gap: 10,
      background: { type: 'image', color: '#1c1917', image: { url: photo(PHOTOS.feast, 1600), size: 'cover', position: 'center' }, overlay: darkOverlay(58) },
    },
    mobile: { stack: true, gap: 8, padding: box(40, 16, 32, 16) },
    columns: [
      {
        style: { gap: 10, textAlign: 'center', color: WHITE },
        widgets: [
          text('Order {order_number}', centred({ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: WHITE_SOFT })),
          heading('{store}', 'h1', centred({ fontSize: 44, fontWeight: 800, lineHeight: 1.05, color: WHITE }), { fontSize: 34 }),
          text('Thanks for ordering, {name}. Follow your order below.', centred({ fontSize: 17, color: WHITE_SOFT }), { fontSize: 15 }),
        ],
      },
    ],
  })
  return design([
    banner,
    pageSection('Order — details', [
      block('tracking.status'),
      block('tracking.ring_me'),
      block('tracking.pickup_qr'),
      block('tracking.timeline'),
      block('tracking.summary'),
      block('tracking.loyalty'),
      block('tracking.back'),
    ]),
  ])
}

/** Status and progress beside the receipt on computers; one column on phones. */
function buildSideBySide(): HeroDesignV5 {
  const twoColumns = section({
    label: 'Order — side by side',
    widths: [56, 44],
    style: { padding: box(24, 16, 40, 16), contentWidth: 960, gap: 24, align: 'start' },
    tablet: { padding: box(24, 16, 40, 16) },
    mobile: { stack: true, gap: GAP, padding: PAGE_PADDING_MOBILE },
    columns: [
      { style: { gap: GAP }, widgets: [block('tracking.status'), block('tracking.ring_me'), block('tracking.pickup_qr'), block('tracking.timeline')] },
      { style: { gap: GAP }, widgets: [block('tracking.summary'), block('tracking.loyalty'), block('tracking.back')] },
    ],
  })
  const top = section({
    label: 'Order — header',
    widths: [100],
    style: { padding: box(0), contentWidth: 960, gap: 0 },
    tablet: { padding: box(0) },
    mobile: { stack: true, gap: 0, padding: box(0) },
    columns: [{ style: { gap: 0 }, widgets: [block('tracking.header')] }],
  })
  return design([top, twoColumns])
}

export const TRACKING_TEMPLATES: readonly PageTemplate[] = [
  {
    id: 'friendly',
    name: 'Friendly',
    description: 'A warm greeting and a line for every stage — cooking, ready, enjoy — above your usual order card.',
    category: 'friendly',
    build: buildFriendly,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Just the answer: where the order is, the pickup code and the receipt. Quiet and quick to read.',
    category: 'simple',
    build: buildMinimal,
  },
  {
    id: 'branded-banner',
    name: 'Branded banner',
    description: 'A food photo with your store’s name on top. Swap in your own shot.',
    category: 'branded',
    build: buildBrandedBanner,
  },
  {
    id: 'side-by-side',
    name: 'Side by side',
    description: 'Status and progress beside the receipt on computers and tablets; one tidy column on phones.',
    category: 'simple',
    build: buildSideBySide,
  },
]
