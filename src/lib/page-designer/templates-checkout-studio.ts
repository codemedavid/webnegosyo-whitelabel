// ---------------------------------------------------------------------------
// The Branding Studio's checkout layouts re-created as Page Designer
// templates, so owners recognise the page they already run. (Classic is the
// "Standard" design; Modern and Minimal live in templates-checkout.ts.)
// ---------------------------------------------------------------------------

import { box } from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5, Widget } from '@/lib/hero-builder/types'

import { block as kitBlock, pageDesign, pageSection, pinnedBar, type BlockSpec } from './template-kit'
import type { PageTemplate } from './templates'

const block = (id: string, spec: BlockSpec = {}): Widget => kitBlock('checkout', id, spec)

const NARROW = 560
const STEP_PADDING = box(8, 16, 24, 16)
const STEP_PADDING_MOBILE = box(8, 12, 20, 12)
const step = (label: string, widgets: Widget[]) =>
  pageSection(label, widgets, { width: NARROW, padding: STEP_PADDING, mobilePadding: STEP_PADDING_MOBILE })

/** The Studio's Wizard: one thing at a time in a centred card, numbered steps on top. */
function buildStepByStep(): HeroDesignV5 {
  return pageDesign(
    [
      step('How you’ll get it', [
        block('checkout.header', { options: { variant: 'compact' } }),
        block('checkout.store_closed'),
        block('checkout.order_type', { texts: { title: 'How would you like it?' } }),
        block('checkout.schedule'),
      ]),
      step('Your details', [
        block('checkout.customer', { texts: { title: 'Your information' } }),
        block('checkout.loyalty'),
      ]),
      step('Payment', [
        block('checkout.payment', { texts: { subtitle: 'Select a payment method to continue.' } }),
        block('checkout.voucher'),
        block('checkout.gov_discount'),
      ]),
      step('Review & place order', [
        block('checkout.summary', { texts: { title: 'Review your order' } }),
        block('checkout.sms_opt_in'),
        block('checkout.place_order', { options: { size: 'large' } }),
      ]),
    ],
    { layout: 'steps', progress: 'numbers', nextLabel: 'Continue', parts: { p_card_radius: 'xl', p_card_shadow: 'md', p_card_bw: '0' } },
  )
}

/** The Studio's Express sheet: compact cards and the total + button pinned to the bottom. */
function buildExpress(): HeroDesignV5 {
  const compact = { show_subtitle: false }
  return pageDesign(
    [
      pageSection(
        'Checkout — express',
        [
          block('checkout.header', { options: { variant: 'compact' } }),
          block('checkout.store_closed'),
          block('checkout.order_type', { options: { variant: 'segmented', ...compact }, texts: { title: 'How do you want it?' } }),
          block('checkout.schedule', { options: { variant: 'pill' } }),
          block('checkout.customer', { options: { variant: 'filled', columns: '1', ...compact }, texts: { title: 'Your details' } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'rows', ...compact } }),
          block('checkout.summary', { options: { variant: 'compact', ...compact }, texts: { title: 'Order summary' } }),
          block('checkout.voucher', { options: { variant: 'tucked' } }),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
        ],
        { width: NARROW, gap: 12 },
      ),
      pinnedBar('Order bar', [
        block('checkout.place_order', {
          options: { variant: 'rounded', show_total: true },
          texts: { footer: 'Your order is sent to the restaurant for confirmation.' },
        }),
      ], { width: NARROW }),
    ],
    { parts: { p_card_radius: 'xl', p_card_shadow: 'none', p_card_space: 'tight', p_title_size: 'md', p_option_radius: 'lg' } },
  )
}

/** The Studio's BiteSpeed: "Your Order" first, chunky cards, a sticky bar with the total. */
function buildBoldOnePage(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection(
        'Checkout — bold one-page',
        [
          block('checkout.header', { options: { variant: 'centered' } }),
          block('checkout.store_closed'),
          block('checkout.summary', { options: { show_subtitle: false }, texts: { title: 'Your Order' } }),
          block('checkout.voucher'),
          block('checkout.order_type', { options: { variant: 'buttons', show_subtitle: false }, texts: { title: 'How do you want it?' } }),
          block('checkout.schedule'),
          block('checkout.customer', { options: { variant: 'filled', show_subtitle: false }, texts: { title: 'Your Details' } }),
          block('checkout.loyalty'),
          block('checkout.payment', { options: { variant: 'grid', show_subtitle: false } }),
          block('checkout.gov_discount'),
          block('checkout.sms_opt_in'),
        ],
        { width: 640, gap: 18 },
      ),
      pinnedBar('Order bar', [block('checkout.place_order', { options: { size: 'large', show_total: true }, texts: { footer: 'Your order is sent to the restaurant for confirmation.' } })], { width: 640 }),
    ],
    {
      parts: {
        p_card_radius: 'xl',
        p_card_shadow: 'lg',
        p_card_bw: '0',
        p_title_font: 'archivo',
        p_title_weight: '800',
        p_title_size: 'xl',
        p_option_radius: 'lg',
        p_option_label_weight: '700',
        p_button_weight: '800',
        p_button_case: 'upper',
      },
    },
  )
}

export const CHECKOUT_STUDIO_TEMPLATES: readonly PageTemplate[] = [
  {
    id: 'step-by-step',
    name: 'Step by step',
    description: 'The Studio’s Wizard: how you’ll get it, your details, payment, then review — one step at a time with numbered progress.',
    category: 'simple',
    build: buildStepByStep,
  },
  {
    id: 'express',
    name: 'Express',
    description: 'The Studio’s Express sheet: compact cards, a pill toggle for the order type, and the total and button pinned to the bottom.',
    category: 'delivery',
    build: buildExpress,
  },
  {
    id: 'bold-one-page',
    name: 'Bold one-page',
    description: 'The Studio’s BiteSpeed look: “Your Order” first, chunky shadowed cards, big buttons and a sticky order bar.',
    category: 'bold',
    build: buildBoldOnePage,
  },
]
