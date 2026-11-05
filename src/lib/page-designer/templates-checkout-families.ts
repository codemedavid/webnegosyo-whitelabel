// ---------------------------------------------------------------------------
// Checkout looks that come with a matching thank-you and tracking page (the
// `family`, see templates-looks.ts). Each holds every checkout block.
// ---------------------------------------------------------------------------

import { box, text, widget } from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5, NodeStyle, Widget } from '@/lib/hero-builder/types'

import { block as kitBlock, centred, pageDesign, pageSection, pinnedBar, solid, type BlockSpec, TIDY_FORM } from './template-kit'
import {
  BOLD_LOOK, CHAT_LOOK, DELIVERY_LOOK, EDITORIAL_LOOK, EDITORIAL_THEME, RECEIPT_LOOK, RECEIPT_PAPER, TICKET_LOOK,
} from './templates-looks'
import type { PageTemplate } from './templates'

const block = (id: string, spec: BlockSpec = {}): Widget => kitBlock('checkout', id, spec)

const NARROW = 560
const tearLine = (): Widget => widget('divider', { lineStyle: 'dashed' }, { size: 2, accentColor: '@muted', margin: box(6, 0) })
const hairline = (): Widget => widget('divider', {}, { size: 1, accentColor: '@muted', margin: box(8, 0) })

// ── Delivery app ───────────────────────────────────────────────────────────

/** Soft bands of rounded cards, a pill toggle, rows to pay, "Bill details" and a sticky bar. */
function buildDeliveryApp(): HeroDesignV5 {
  const band = { width: NARROW, gap: 10, padding: box(6, 16, 6, 16), mobilePadding: box(6, 10, 6, 10), style: { background: solid('@background') } }
  return pageDesign(
    [
      pageSection('Delivery', [
        block('checkout.header', { options: { variant: 'compact' } }),
        block('checkout.store_closed'),
        block('checkout.order_type', { options: { variant: 'segmented', show_subtitle: false }, texts: { title: 'How do you want it?' } }),
        block('checkout.schedule', { options: { variant: 'pill' } }),
      ], band),
      pageSection('Your details', [
        block('checkout.customer', { options: { ...TIDY_FORM, variant: 'label_inside', columns: '1', show_subtitle: false }, texts: { title: 'Your details' } }),
        block('checkout.loyalty'),
      ], band),
      pageSection('Payment', [
        block('checkout.payment', { options: { variant: 'rows', show_subtitle: false }, texts: { title: 'Pay with' } }),
        block('checkout.gov_discount'),
      ], band),
      pageSection('Bill details', [
        block('checkout.voucher', { options: { variant: 'tucked' } }),
        block('checkout.summary', { options: { variant: 'compact', show_subtitle: false }, texts: { title: 'Bill details' } }),
        block('checkout.sms_opt_in'),
      ], { ...band, padding: box(6, 16, 24, 16), mobilePadding: box(6, 10, 20, 10) }),
      pinnedBar('Order bar', [block('checkout.place_order', { options: { show_total: true } })], { width: NARROW }),
    ],
    { parts: DELIVERY_LOOK },
  )
}

// ── Receipt roll ───────────────────────────────────────────────────────────

const TYPEWRITER: NodeStyle = { fontFamily: 'mono', fontSize: 13, letterSpacing: 2, color: '@muted' }

/** A printed slip: typewriter letters, dashed edges and the order on paper. */
function buildReceiptRoll(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection(
        'Checkout — receipt',
        [
          block('checkout.header', { options: { variant: 'compact' } }),
          text('*** {store} ***', centred(TYPEWRITER)),
          block('checkout.store_closed'),
          block('checkout.summary', { options: { variant: 'receipt', total_color: 'text' }, parts: RECEIPT_PAPER, texts: { title: 'Your order' } }),
          block('checkout.voucher', { options: { variant: 'field' } }),
          tearLine(),
          block('checkout.order_type', { options: { variant: 'list', icon_style: 'none', show_subtitle: false }, texts: { title: 'Order type' } }),
          block('checkout.schedule', { options: { variant: 'list' } }),
          block('checkout.customer', { options: { ...TIDY_FORM, variant: 'ruled', columns: '1', show_subtitle: false }, texts: { title: 'Customer' } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'rows', show_subtitle: false } }),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
          tearLine(),
          block('checkout.place_order', { options: { variant: 'square' } }),
          text('Thank you — please come again', centred(TYPEWRITER)),
        ],
        { width: 480, gap: 14 },
      ),
    ],
    { parts: RECEIPT_LOOK },
    { headingFont: 'mono', bodyFont: 'mono' },
  )
}

// ── Bold blocks ────────────────────────────────────────────────────────────

/** Thick ink frames, hard shadows and black-weight capitals. */
function buildBoldBlocks(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection(
        'Checkout — bold blocks',
        [
          block('checkout.header', { options: { variant: 'banner' } }),
          block('checkout.store_closed', { options: { variant: 'outline' } }),
          block('checkout.order_type', { options: { variant: 'tiles', icon_style: 'plain' }, texts: { title: 'How do you want it?' } }),
          block('checkout.schedule', { options: { variant: 'cards' } }),
          block('checkout.customer', { options: { ...TIDY_FORM, variant: 'clean' }, texts: { title: 'Your details' } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'grid' } }),
          block('checkout.summary', { options: { total_color: 'text' }, texts: { title: 'Your order' } }),
          block('checkout.voucher'),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
          block('checkout.place_order', { options: { variant: 'square', size: 'large' } }),
        ],
        { width: 640, gap: 20 },
      ),
    ],
    { parts: BOLD_LOOK },
  )
}

// ── Ticket stub ────────────────────────────────────────────────────────────

/** The order first like a ticket, a dashed tear line, then the rest. */
function buildTicketStub(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection(
        'Checkout — ticket',
        [
          block('checkout.header', { options: { variant: 'centered' } }),
          block('checkout.store_closed'),
          block('checkout.summary', { options: { show_subtitle: false }, parts: { p_title_align: 'center' }, texts: { title: 'Your ticket' } }),
          block('checkout.voucher', { options: { variant: 'tucked' } }),
          tearLine(),
          block('checkout.order_type', { options: { variant: 'cards', show_subtitle: false } }),
          block('checkout.schedule'),
          block('checkout.customer', { options: { ...TIDY_FORM, variant: 'clean', show_subtitle: false }, texts: { title: 'Your details' } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'wallet', show_subtitle: false } }),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
          tearLine(),
          block('checkout.place_order', { options: { variant: 'rounded', size: 'large' } }),
        ],
        { width: NARROW, gap: 14 },
      ),
    ],
    { parts: TICKET_LOOK },
  )
}

// ── Editorial ──────────────────────────────────────────────────────────────

const numeral = (value: string): Widget =>
  text(value, { fontFamily: 'playfair-display', fontSize: 40, lineHeight: 1, color: '@muted', margin: box(12, 0, 0, 0) }, { fontSize: 32 })

/** Serif numerals and titles, hairlines between the parts, underlined answers. */
function buildEditorial(): HeroDesignV5 {
  const plain = { card: false, show_subtitle: false }
  return pageDesign(
    [
      pageSection(
        'Checkout — editorial',
        [
          block('checkout.header', { options: { variant: 'centered', show_subtitle: false } }),
          block('checkout.store_closed', { options: { variant: 'outline' } }),
          numeral('01'),
          block('checkout.order_type', { options: { ...plain, variant: 'list', icon_style: 'none' }, texts: { title: 'How you’ll get it' } }),
          block('checkout.schedule', { options: { card: false, variant: 'list' } }),
          hairline(),
          numeral('02'),
          block('checkout.customer', { options: { ...TIDY_FORM, ...plain, variant: 'ruled' }, texts: { title: 'Your details' } }),
          block('checkout.loyalty'),
          hairline(),
          numeral('03'),
          block('checkout.payment', { options: { ...plain, variant: 'rows' } }),
          block('checkout.gov_discount', { options: { card: false } }),
          hairline(),
          numeral('04'),
          block('checkout.summary', { options: plain, texts: { title: 'Your order' } }),
          block('checkout.voucher', { options: { card: false, variant: 'tucked' } }),
          block('checkout.sms_opt_in'),
          block('checkout.place_order', { options: { variant: 'square' } }),
        ],
        { width: 600, gap: 16 },
      ),
    ],
    { parts: { ...EDITORIAL_LOOK, p_button_alt_bg: '#00000000' } },
    EDITORIAL_THEME,
  )
}

// ── Chat ───────────────────────────────────────────────────────────────────

const BUBBLE: NodeStyle = {
  fontSize: 15,
  lineHeight: 1.5,
  color: '@text',
  background: solid('@surface'),
  radius: 20,
  padding: box(12, 16),
  maxWidth: 420,
}

/** A friendly conversation: question titles, bubbles and pill choices. */
function buildChat(): HeroDesignV5 {
  const quiet = { show_subtitle: false }
  return pageDesign(
    [
      pageSection(
        'Checkout — chat',
        [
          block('checkout.header', { options: { variant: 'compact' } }),
          text('Hi! A few quick questions and your order is on its way to {store}.', BUBBLE),
          block('checkout.store_closed'),
          block('checkout.order_type', { options: { variant: 'chips', ...quiet }, texts: { title: 'How are you getting it?' } }),
          block('checkout.schedule', { options: { variant: 'pill' }, texts: { title: 'When should we have it ready?' } }),
          block('checkout.customer', { options: { ...TIDY_FORM, variant: 'label_inside', columns: '1', ...quiet }, texts: { title: 'Who’s it for?' } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'wallet', ...quiet }, texts: { title: 'How would you like to pay?' } }),
          block('checkout.summary', { options: { variant: 'compact', ...quiet }, texts: { title: 'Here’s what you’re getting' } }),
          block('checkout.voucher', { options: { variant: 'tucked' } }),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
          text('All set? Tap the button and we’ll send it over.', BUBBLE),
          block('checkout.place_order', { options: { variant: 'pill', size: 'large' } }),
        ],
        { width: NARROW, gap: 14 },
      ),
    ],
    { parts: CHAT_LOOK },
  )
}

export const CHECKOUT_FAMILY_TEMPLATES: readonly PageTemplate[] = [
  {
    id: 'delivery-app',
    name: 'Delivery app',
    description: 'Soft bands of rounded cards, a pill toggle, “Bill details” and a sticky bar with the total — like the big delivery apps.',
    category: 'delivery',
    family: 'delivery-app',
    build: buildDeliveryApp,
  },
  {
    id: 'receipt-roll',
    name: 'Receipt roll',
    description: 'A printed slip: typewriter letters, dashed edges and the order on paper.',
    category: 'playful',
    family: 'receipt-roll',
    build: buildReceiptRoll,
  },
  {
    id: 'bold-blocks',
    name: 'Bold blocks',
    description: 'Thick frames, hard shadows and big capital titles. Loud and easy to tap.',
    category: 'bold',
    family: 'bold-blocks',
    build: buildBoldBlocks,
  },
  {
    id: 'ticket-stub',
    name: 'Ticket stub',
    description: 'The order first like a ticket, dashed tear lines, rounded cards and a big total.',
    category: 'playful',
    family: 'ticket-stub',
    build: buildTicketStub,
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Serif numerals and titles, hairlines and underlined answers — like a menu printed for a magazine.',
    category: 'branded',
    family: 'editorial',
    build: buildEditorial,
  },
  {
    id: 'chat',
    name: 'Chat',
    description: 'A friendly conversation: question titles, speech bubbles and pill choices.',
    category: 'friendly',
    family: 'chat',
    build: buildChat,
  },
]
