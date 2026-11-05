// ---------------------------------------------------------------------------
// Checkouts built around the form: one column, no shouting. Boxes draw neutral
// lines from the text colour (the store's accent shows only on the box being
// typed in), so these hold up on any store's colours. Shape and type come from
// part styles; colours stay the store's (Look tab / Branding Studio).
// ---------------------------------------------------------------------------

import type { HeroDesignV5, Widget } from '@/lib/hero-builder/types'

import { block as kitBlock, pageDesign, pageSection, solid, TIDY_FORM, type BlockSpec } from './template-kit'
import type { PageTemplate } from './templates'

const block = (id: string, spec: BlockSpec = {}): Widget => kitBlock('checkout', id, spec)

const NARROW = 540
const BAND = { style: { background: solid('@background') } }

interface FormPageSpec {
  label: string
  form: Record<string, string | boolean>
  title: string
  order: Record<string, string | boolean>
  /** Blocks' card switch and subtitle, for pages without cards. */
  cards: Record<string, string | boolean>
  button: Record<string, string | boolean>
  parts: Record<string, string>
}

function formPage({ label, form, title, order, cards, button, parts }: FormPageSpec): HeroDesignV5 {
  return pageDesign(
    [
      pageSection(
        label,
        [
          block('checkout.header', { options: { variant: 'compact', show_subtitle: false } }),
          block('checkout.store_closed'),
          block('checkout.order_type', { options: { ...order, ...cards } }),
          block('checkout.schedule', { options: { variant: 'pill', ...('card' in cards ? { card: cards.card } : {}) } }),
          block('checkout.customer', { options: { ...TIDY_FORM, columns: '1', show_subtitle: false, ...cards, ...form }, texts: { title } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'rows', ...cards } }),
          block('checkout.summary', { options: { variant: 'compact', ...cards }, texts: { title: 'Your order' } }),
          block('checkout.voucher', { options: { variant: 'tucked' } }),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
          block('checkout.place_order', { options: button }),
        ],
        { width: NARROW, gap: 16, ...BAND },
      ),
    ],
    { parts },
  )
}

const QUIET_CARDS = { p_card_radius: 'lg', p_card_shadow: 'none', p_card_bw: '0', p_title_size: 'lg', p_title_weight: '700', p_title_letter: 'tight' }

const buildQuietForm = (): HeroDesignV5 =>
  formPage({
    label: 'Checkout — quiet form',
    form: { variant: 'clean' },
    title: 'Your details',
    order: { variant: 'segmented', show_subtitle: false },
    cards: { show_subtitle: false },
    button: { variant: 'rounded' },
    parts: { ...QUIET_CARDS, p_option_shadow: 'none', p_button_radius: 'md' },
  })

const buildBookingApp = (): HeroDesignV5 =>
  formPage({
    label: 'Checkout — booking app',
    form: { variant: 'label_inside', address_map: 'map' },
    title: 'Who’s it for?',
    order: { variant: 'tabs', show_subtitle: false },
    cards: { show_subtitle: false },
    button: { variant: 'rounded' },
    parts: { ...QUIET_CARDS, p_card_shadow: 'sm', p_title_size: 'md', p_button_radius: 'lg' },
  })

const buildPhoneSheet = (): HeroDesignV5 =>
  formPage({
    label: 'Checkout — phone settings',
    form: { variant: 'sheet' },
    title: 'Contact',
    order: { variant: 'list', icon_style: 'plain', show_subtitle: false },
    cards: { card: false, show_subtitle: false },
    button: { variant: 'rounded', card: false },
    parts: { p_title_size: 'sm', p_title_weight: '600', p_option_shadow: 'none', p_button_radius: 'lg' },
  })

const buildPaperForm = (): HeroDesignV5 =>
  formPage({
    label: 'Checkout — paper form',
    form: { variant: 'ruled' },
    title: 'Your details',
    order: { variant: 'tabs', show_subtitle: false },
    cards: { card: false, show_subtitle: false },
    button: { card: false },
    parts: { p_title_size: 'xl', p_title_weight: '700', p_title_letter: 'tight', p_option_shadow: 'none', p_button_radius: 'none' },
  })

const buildEasyRead = (): HeroDesignV5 =>
  formPage({
    label: 'Checkout — easy to read',
    form: { variant: 'roomy', columns: '1', address_map: 'map', address_details: 'open' },
    title: 'Your details',
    order: { variant: 'buttons', show_subtitle: false },
    cards: { show_subtitle: false },
    button: { size: 'large' },
    parts: { ...QUIET_CARDS, p_title_size: 'xl', p_button_radius: 'lg' },
  })

export const CHECKOUT_FORM_TEMPLATES: readonly PageTemplate[] = [
  {
    id: 'quiet-form',
    name: 'Quiet form',
    description: 'Fine lines and clear labels. Your colour shows only on the box being typed in.',
    category: 'simple',
    build: buildQuietForm,
  },
  {
    id: 'booking-app',
    name: 'Booking app',
    description: 'Each question sits inside its own box, with the delivery map right under the address.',
    category: 'delivery',
    build: buildBookingApp,
  },
  {
    id: 'phone-sheet',
    name: 'Phone settings',
    description: 'One soft panel with thin lines between questions. Feels at home on a phone.',
    category: 'simple',
    build: buildPhoneSheet,
  },
  {
    id: 'paper-form',
    name: 'Paper form',
    description: 'No boxes: a hairline under each answer and small capitals above, like a printed form.',
    category: 'simple',
    build: buildPaperForm,
  },
  {
    id: 'easy-read',
    name: 'Easy to read',
    description: 'Big boxes, big labels and a big button, for customers of every age.',
    category: 'friendly',
    build: buildEasyRead,
  },
]
