// ---------------------------------------------------------------------------
// Thank-you looks matching the checkout families (templates-looks.ts). Each
// holds every thank-you block; celebration lines only speak on an order the
// store received ("Show when: Order sent") — a lost order keeps the status
// block's own help.
// ---------------------------------------------------------------------------

import { box, text, widget } from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5, NodeStyle, Widget } from '@/lib/hero-builder/types'

import { block as kitBlock, centred, onlyWhen, pageDesign, pageSection, solid, type BlockSpec } from './template-kit'
import {
  BOLD_LOOK, CHAT_LOOK, DELIVERY_LOOK, EDITORIAL_LOOK, EDITORIAL_THEME, RECEIPT_LOOK, RECEIPT_PAPER, TICKET_LOOK,
} from './templates-looks'
import type { PageTemplate } from './templates'

const block = (id: string, spec: BlockSpec = {}): Widget => kitBlock('confirmation', id, spec)
const onSuccess = (widget: Widget): Widget => onlyWhen(widget, ['success'])

const WIDTH = 560
const tearLine = (): Widget => widget('divider', { lineStyle: 'dashed' }, { size: 2, accentColor: '@muted', margin: box(6, 0) })
const hairline = (): Widget => widget('divider', {}, { size: 1, accentColor: '@muted', margin: box(8, 0) })

function buildDeliveryApp(): HeroDesignV5 {
  const band = { width: WIDTH, gap: 10, padding: box(8, 16, 8, 16), mobilePadding: box(8, 10, 8, 10), style: { background: solid('@background') } }
  return pageDesign(
    [
      pageSection('Thank you — status', [
        block('confirmation.status', { options: { variant: 'banner' }, texts: { title: 'Order placed!' } }),
        block('confirmation.actions', { options: { variant: 'stacked', button_shape: 'pill' } }),
        block('confirmation.messenger', { options: { button_shape: 'pill' } }),
      ], band),
      pageSection('Thank you — bill', [
        block('confirmation.summary', { options: { variant: 'compact' }, texts: { title: 'Bill details' } }),
        block('confirmation.customer', { options: { variant: 'compact' }, texts: { title: 'Your details' } }),
        block('confirmation.payment', { options: { variant: 'compact' }, texts: { title: 'Paying with' } }),
      ], { ...band, padding: box(8, 16, 32, 16), mobilePadding: box(8, 10, 24, 10) }),
    ],
    { parts: DELIVERY_LOOK },
  )
}

const TYPEWRITER: NodeStyle = { fontFamily: 'mono', fontSize: 13, letterSpacing: 2, color: '@muted' }

function buildReceiptRoll(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection('Thank you — receipt', [
        text('*** {store} ***', centred(TYPEWRITER)),
        block('confirmation.status', { options: { variant: 'card', show_icon: false }, texts: { title: 'Order received' } }),
        block('confirmation.summary', { options: { variant: 'receipt' }, parts: RECEIPT_PAPER, texts: { title: 'Your receipt' } }),
        tearLine(),
        block('confirmation.customer', { options: { variant: 'plain' }, texts: { title: 'Customer' } }),
        block('confirmation.payment', { options: { variant: 'plain' } }),
        tearLine(),
        block('confirmation.messenger', { options: { button_shape: 'square' } }),
        block('confirmation.actions', { options: { variant: 'outline', button_shape: 'square' } }),
        onSuccess(text('Thank you — please come again', centred(TYPEWRITER))),
      ], { width: 480, gap: 14 }),
    ],
    { parts: RECEIPT_LOOK },
    { headingFont: 'mono', bodyFont: 'mono' },
  )
}

function buildBoldBlocks(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection('Thank you — bold blocks', [
        block('confirmation.status', { options: { variant: 'banner' }, texts: { title: 'Order in!' } }),
        block('confirmation.actions', { options: { variant: 'side', button_shape: 'square' } }),
        block('confirmation.summary', { texts: { title: 'Your order' } }),
        block('confirmation.payment'),
        block('confirmation.customer'),
        block('confirmation.messenger', { options: { button_shape: 'square' } }),
      ], { width: 640, gap: 20 }),
    ],
    { parts: BOLD_LOOK },
  )
}

function buildTicketStub(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection('Thank you — ticket', [
        block('confirmation.status', { options: { variant: 'centered' } }),
        block('confirmation.summary', { parts: { p_title_align: 'center' }, texts: { title: 'Your ticket' } }),
        tearLine(),
        block('confirmation.payment', { options: { variant: 'compact' } }),
        block('confirmation.customer', { options: { variant: 'compact' } }),
        tearLine(),
        block('confirmation.actions', { options: { variant: 'stacked', button_shape: 'rounded' } }),
        block('confirmation.messenger', { options: { button_shape: 'rounded' } }),
      ], { width: WIDTH, gap: 14 }),
    ],
    { parts: TICKET_LOOK },
  )
}

const SERIF_THANKS: NodeStyle = { fontFamily: 'playfair-display', fontSize: 44, fontWeight: 600, lineHeight: 1.1, color: '@text' }

function buildEditorial(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection('Thank you — editorial', [
        onSuccess(text('Thank you.', centred(SERIF_THANKS), { fontSize: 36 })),
        block('confirmation.status', { options: { variant: 'card', show_icon: false } }),
        hairline(),
        block('confirmation.summary', { texts: { title: 'Your order' } }),
        hairline(),
        block('confirmation.payment', { options: { variant: 'plain' } }),
        block('confirmation.customer', { options: { variant: 'plain' } }),
        hairline(),
        block('confirmation.actions', { options: { variant: 'outline', button_shape: 'square' } }),
        block('confirmation.messenger', { options: { button_shape: 'square' } }),
      ], { width: 600, gap: 16 }),
    ],
    { parts: { ...EDITORIAL_LOOK, p_button_alt_bg: '#00000000' } },
    EDITORIAL_THEME,
  )
}

const BUBBLE: NodeStyle = {
  fontSize: 15,
  lineHeight: 1.5,
  color: '@text',
  background: solid('@surface'),
  radius: 20,
  padding: box(12, 16),
  maxWidth: 420,
}

function buildChat(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection('Thank you — chat', [
        block('confirmation.status', { options: { variant: 'card' }, texts: { title: 'Got it!' } }),
        onSuccess(text('{store} has your order. Tap below to follow it live.', BUBBLE)),
        block('confirmation.actions', { options: { variant: 'stacked', button_shape: 'pill' } }),
        block('confirmation.messenger', { options: { button_shape: 'pill' } }),
        block('confirmation.summary', { options: { variant: 'compact' }, texts: { title: 'Here’s what you ordered' } }),
        block('confirmation.payment', { options: { variant: 'compact' }, texts: { title: 'How you’re paying' } }),
        block('confirmation.customer', { options: { variant: 'compact' }, texts: { title: 'Your details' } }),
      ], { width: WIDTH, gap: 14 }),
    ],
    { parts: CHAT_LOOK },
  )
}

export const CONFIRMATION_FAMILY_TEMPLATES: readonly PageTemplate[] = [
  {
    id: 'delivery-app',
    name: 'Delivery app',
    description: 'A coloured banner, the track button straight away and “Bill details” on soft bands.',
    category: 'delivery',
    family: 'delivery-app',
    build: buildDeliveryApp,
  },
  {
    id: 'receipt-roll',
    name: 'Receipt roll',
    description: 'A printed slip in typewriter letters, the receipt on paper and dashed tear lines.',
    category: 'playful',
    family: 'receipt-roll',
    build: buildReceiptRoll,
  },
  {
    id: 'bold-blocks',
    name: 'Bold blocks',
    description: 'A loud banner, thick frames and hard shadows, buttons side by side.',
    category: 'bold',
    family: 'bold-blocks',
    build: buildBoldBlocks,
  },
  {
    id: 'ticket-stub',
    name: 'Ticket stub',
    description: 'The big tick, the order as a ticket and dashed tear lines.',
    category: 'playful',
    family: 'ticket-stub',
    build: buildTicketStub,
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'A large serif “Thank you.”, hairlines and quiet square buttons.',
    category: 'branded',
    family: 'editorial',
    build: buildEditorial,
  },
  {
    id: 'chat',
    name: 'Chat',
    description: 'A friendly “Got it!” and a speech bubble, pill buttons and round cards.',
    category: 'friendly',
    family: 'chat',
    build: buildChat,
  },
]
