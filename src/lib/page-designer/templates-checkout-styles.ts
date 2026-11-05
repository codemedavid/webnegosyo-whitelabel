// ---------------------------------------------------------------------------
// Checkout styles beyond the Studio's layouts: list rows, folding panels,
// counter and kiosk pages, a timeline. Shape and type come from part styles;
// colours stay the store's (Look tab / Branding Studio).
// ---------------------------------------------------------------------------

import { badge, box, heading, text } from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5, Widget } from '@/lib/hero-builder/types'

import { block as kitBlock, centred, pageDesign, pageSection, pinnedBar, solid, type BlockSpec } from './template-kit'
import type { PageTemplate } from './templates'

const block = (id: string, spec: BlockSpec = {}): Widget => kitBlock('checkout', id, spec)

const NARROW = 560
const BAND = { style: { background: solid('@background') } }

/** iOS-style grouped rows: list designs, hairlines, no shadows. */
function buildInsetList(): HeroDesignV5 {
  const quiet = { show_subtitle: false }
  return pageDesign(
    [
      pageSection(
        'Checkout — inset list',
        [
          block('checkout.header', { options: { variant: 'compact' } }),
          block('checkout.store_closed'),
          block('checkout.order_type', { options: { variant: 'list', icon_style: 'plain', ...quiet }, texts: { title: 'Order type' } }),
          block('checkout.schedule', { options: { variant: 'list' }, texts: { title: 'When' } }),
          block('checkout.customer', { options: { variant: 'filled', columns: '1', ...quiet }, texts: { title: 'Your details' } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'rows', ...quiet } }),
          block('checkout.summary', { options: { variant: 'compact', ...quiet }, texts: { title: 'Order' } }),
          block('checkout.voucher', { options: { variant: 'tucked' } }),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
          block('checkout.place_order', { options: { variant: 'rounded' } }),
        ],
        { width: NARROW, gap: 20, ...BAND },
      ),
    ],
    {
      parts: {
        p_card_radius: 'lg',
        p_card_shadow: 'none',
        p_card_bw: '0',
        p_title_size: 'xs',
        p_title_weight: '600',
        p_title_case: 'upper',
        p_title_letter: 'wide',
        p_option_radius: 'md',
        p_option_bw: '1',
        p_option_shadow: 'none',
        p_option_label_weight: '500',
        p_field_radius: 'md',
        p_divider_bw: '1',
        p_button_radius: 'lg',
      },
    },
  )
}

/** The order and Place order up top; the details to fill in sit below. */
function buildRolledUp(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection(
        'Review & order',
        [
          block('checkout.header', { options: { variant: 'compact' } }),
          block('checkout.store_closed'),
          block('checkout.summary', { options: { variant: 'compact' }, texts: { title: 'Your order' } }),
          block('checkout.voucher', { options: { variant: 'tucked' } }),
          block('checkout.place_order', { options: { variant: 'rounded' }, texts: { footer: 'We’ll check the details below before your order is sent.' } }),
        ],
        { width: NARROW, gap: 12, padding: box(20, 16, 12, 16), mobilePadding: box(12, 12, 8, 12) },
      ),
      pageSection(
        'Your details',
        [
          heading('Your details', 'h2', { fontSize: 20, fontWeight: 800, color: '@text' }),
          block('checkout.order_type', { options: { variant: 'list', show_subtitle: false } }),
          block('checkout.schedule', { options: { variant: 'list' } }),
          block('checkout.customer', { options: { columns: '1', show_subtitle: false }, texts: { title: 'Contact' } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'rows', show_subtitle: false } }),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
        ],
        { width: NARROW, gap: 12 },
      ),
    ],
    { parts: { p_card_radius: 'lg', p_card_shadow: 'sm', p_card_space: 'tight', p_title_size: 'md' } },
  )
}

/** Numbered folding panels; Place order stays pinned at the bottom. */
function buildAccordion(): HeroDesignV5 {
  const flat = { card: false, show_subtitle: false }
  return pageDesign(
    [
      pageSection('How you’ll get it', [
        block('checkout.header', { options: { variant: 'compact' } }),
        block('checkout.store_closed'),
        block('checkout.order_type', { options: flat }),
        block('checkout.schedule', { options: { card: false } }),
      ]),
      pageSection('Your details', [block('checkout.customer', { options: flat }), block('checkout.loyalty')]),
      pageSection('Payment', [block('checkout.payment', { options: flat }), block('checkout.gov_discount', { options: { card: false } })]),
      pageSection('Review your order', [
        block('checkout.summary', { options: flat }),
        block('checkout.voucher', { options: { card: false } }),
        block('checkout.sms_opt_in'),
      ]),
      pinnedBar('Place order', [block('checkout.place_order')]),
    ],
    { layout: 'accordion', parts: { p_card_radius: 'lg', p_card_shadow: 'sm', p_option_radius: 'md' } },
  )
}

/** The order first, then quick choices; the code box sits right above the button. */
function buildStoreOnePage(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection(
        'Checkout — store one-page',
        [
          block('checkout.header'),
          block('checkout.store_closed'),
          block('checkout.summary', { options: { variant: 'compact', show_subtitle: false }, texts: { title: 'Your order' } }),
          block('checkout.order_type', { options: { variant: 'cards', show_subtitle: false } }),
          block('checkout.schedule'),
          block('checkout.customer', { options: { show_subtitle: false }, texts: { title: 'Your details' } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'wallet', show_subtitle: false } }),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
          block('checkout.voucher', { options: { variant: 'field' } }),
          block('checkout.place_order', { options: { size: 'large' } }),
        ],
        { width: 640, gap: 14 },
      ),
    ],
    { parts: { p_card_radius: 'md', p_card_shadow: 'sm', p_option_radius: 'sm', p_option_shadow: 'none', p_title_size: 'lg' } },
  )
}

/** A big banner header and centred, easy choices — for counters and takeaway windows. */
function buildPickupCounter(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection(
        'Checkout — counter',
        [
          block('checkout.header', { options: { variant: 'banner' }, texts: { subtitle: 'Order ahead from {store}' } }),
          block('checkout.store_closed'),
          block('checkout.order_type', { options: { variant: 'buttons', align: 'center' }, texts: { title: 'How would you like it?' } }),
          block('checkout.schedule', { options: { variant: 'pill' } }),
          block('checkout.customer', { options: { columns: '1' }, texts: { title: 'Your details', subtitle: 'So we know who it’s for' } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'grid' } }),
          block('checkout.summary'),
          block('checkout.voucher', { options: { variant: 'tucked' } }),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
          block('checkout.place_order', { options: { size: 'large' } }),
        ],
        { width: 600, gap: 16 },
      ),
    ],
    {
      parts: {
        p_title_align: 'center',
        p_subtitle_align: 'center',
        p_title_size: 'xl',
        p_title_weight: '800',
        p_banner_radius: 'xl',
        p_card_radius: 'xl',
        p_option_radius: 'xl',
        p_option_label_size: 'lg',
        p_option_label_weight: '700',
        p_button_radius: 'pill',
      },
    },
  )
}

/** Huge targets for a tablet on the counter or a table: big choices, tall boxes and buttons. */
function buildKiosk(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection(
        'Checkout — kiosk',
        [
          block('checkout.header', { options: { variant: 'centered', show_back: true } }),
          block('checkout.store_closed'),
          block('checkout.order_type', { options: { variant: 'chips', show_subtitle: false }, texts: { title: 'How would you like it?' } }),
          block('checkout.schedule', { options: { variant: 'cards' } }),
          block('checkout.customer', { options: { variant: 'filled', columns: '1', show_subtitle: false }, texts: { title: 'Your details' } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'grid', show_subtitle: false } }),
          block('checkout.summary', { options: { show_subtitle: false } }),
          block('checkout.voucher'),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
          block('checkout.place_order', { options: { size: 'large', variant: 'rounded' } }),
        ],
        { width: 820, gap: 20 },
      ),
    ],
    {
      parts: {
        p_title_size: '2xl',
        p_title_weight: '800',
        p_text_size: 'lg',
        p_card_radius: 'xl',
        p_card_space: 'roomy',
        p_option_radius: 'xl',
        p_option_label_size: 'xl',
        p_option_label_weight: '700',
        p_label_size: 'lg',
        p_field_height: 'xl',
        p_field_radius: 'lg',
        p_button_height: 'xl',
        p_button_size: 'xl',
        p_button_weight: '800',
        p_button_radius: 'lg',
        p_total_size: '2xl',
      },
    },
  )
}

const stepMark = (value: string, icon: string): Widget => badge(value, icon, { fontSize: 13, fontWeight: 700, color: '@primary' })
const STEP = { width: NARROW, padding: box(8, 16, 24, 16), mobilePadding: box(8, 12, 20, 12) }

/** One step at a time with a progress bar; each step opens with its number. */
function buildTimeline(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection('How you’ll get it', [
        block('checkout.header', { options: { variant: 'compact' } }),
        stepMark('1 · How you’ll get it', 'MapPin'),
        block('checkout.store_closed'),
        block('checkout.order_type', { options: { variant: 'list', show_subtitle: false } }),
        block('checkout.schedule', { options: { variant: 'list' } }),
      ], STEP),
      pageSection('Your details', [
        stepMark('2 · Your details', 'User'),
        block('checkout.customer', { options: { show_subtitle: false } }),
        block('checkout.loyalty'),
      ], STEP),
      pageSection('Pay', [
        stepMark('3 · Pay', 'Wallet'),
        block('checkout.payment', { options: { variant: 'rows', show_subtitle: false } }),
        block('checkout.voucher', { options: { variant: 'tucked' } }),
        block('checkout.gov_discount'),
      ], STEP),
      pageSection('Place order', [
        stepMark('4 · Place order', 'CheckCircle2'),
        block('checkout.summary', { options: { show_subtitle: false } }),
        block('checkout.sms_opt_in'),
        text('Check everything once more — then send it to {store}.', centred({ fontSize: 14, color: '@muted' })),
        block('checkout.place_order'),
      ], STEP),
    ],
    {
      layout: 'steps',
      progress: 'bar',
      nextLabel: 'Next step',
      parts: { p_card_radius: 'md', p_card_shadow: 'none', p_card_bw: '1', p_option_radius: 'md', p_title_weight: '700' },
    },
  )
}

export const CHECKOUT_STYLE_TEMPLATES: readonly PageTemplate[] = [
  {
    id: 'inset-list',
    name: 'Inset list',
    description: 'Grouped rows like a phone’s settings: list choices, soft boxes, thin lines and no shadows.',
    category: 'simple',
    build: buildInsetList,
  },
  {
    id: 'rolled-up',
    name: 'Rolled-up review',
    description: 'The order and Place order at the top; the details to fill in below. Quick for returning customers.',
    category: 'store',
    build: buildRolledUp,
  },
  {
    id: 'accordion',
    name: 'Accordion',
    description: 'Numbered panels that fold open one after another, with Place order pinned to the bottom.',
    category: 'simple',
    build: buildAccordion,
  },
  {
    id: 'store-one-page',
    name: 'Store one-page',
    description: 'The order first, then tidy choices, with the voucher box right above the button.',
    category: 'store',
    build: buildStoreOnePage,
  },
  {
    id: 'pickup-counter',
    name: 'Pickup counter',
    description: 'A big banner header, centred titles and big buttons — for counters and takeaway windows.',
    category: 'store',
    build: buildPickupCounter,
  },
  {
    id: 'kiosk',
    name: 'Kiosk / table',
    description: 'Huge choices, tall answer boxes and a big button, for a tablet on the counter or a table.',
    category: 'store',
    build: buildKiosk,
  },
  {
    id: 'timeline',
    name: 'Timeline',
    description: 'Four numbered steps with a progress bar: how you’ll get it, your details, pay, place order.',
    category: 'friendly',
    build: buildTimeline,
  },
]
