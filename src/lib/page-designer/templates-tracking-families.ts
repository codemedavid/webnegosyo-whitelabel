// ---------------------------------------------------------------------------
// Order-tracking looks matching the checkout families (templates-looks.ts).
// Each holds every tracking block (the pickup code and the loyalty card run
// some stores' counters) and is publishable as-is.
// ---------------------------------------------------------------------------

import { box, text, widget } from '@/lib/hero-builder/section-presets'
import type { HeroDesignV5, NodeStyle, Widget } from '@/lib/hero-builder/types'

import { block as kitBlock, centred, onlyWhen, pageDesign, pageSection, solid, type BlockSpec } from './template-kit'
import {
  BOLD_LOOK, CHAT_LOOK, DELIVERY_LOOK, EDITORIAL_LOOK, EDITORIAL_THEME, RECEIPT_LOOK, RECEIPT_PAPER, TICKET_LOOK,
} from './templates-looks'
import type { PageTemplate } from './templates'

const block = (id: string, spec: BlockSpec = {}): Widget => kitBlock('tracking', id, spec)

const WIDTH = 560
const tearLine = (): Widget => widget('divider', { lineStyle: 'dashed' }, { size: 2, accentColor: '@muted', margin: box(6, 0) })
const hairline = (): Widget => widget('divider', {}, { size: 1, accentColor: '@muted', margin: box(8, 0) })

function buildDeliveryApp(): HeroDesignV5 {
  const band = { width: WIDTH, gap: 10, padding: box(8, 16, 8, 16), mobilePadding: box(8, 10, 8, 10), style: { background: solid('@background') } }
  return pageDesign(
    [
      pageSection('Order — status', [
        block('tracking.header', { options: { variant: 'compact' } }),
        block('tracking.status', { options: { variant: 'solid', corners: 'rounded' } }),
        block('tracking.timeline', { options: { variant: 'steps', corners: 'rounded' } }),
        block('tracking.ring_me', { options: { variant: 'button', corners: 'rounded' } }),
        block('tracking.pickup_qr', { options: { corners: 'rounded' } }),
      ], band),
      pageSection('Order — details', [
        block('tracking.summary', { options: { variant: 'compact', corners: 'rounded' }, texts: { title: 'Bill details' } }),
        block('tracking.loyalty', { options: { corners: 'rounded' } }),
        block('tracking.back', { options: { variant: 'outline', corners: 'rounded' } }),
      ], { ...band, padding: box(8, 16, 32, 16), mobilePadding: box(8, 10, 24, 10) }),
    ],
    { parts: DELIVERY_LOOK },
  )
}

const TYPEWRITER: NodeStyle = { fontFamily: 'mono', fontSize: 13, letterSpacing: 2, color: '@muted' }

function buildReceiptRoll(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection('Order — receipt', [
        block('tracking.header', { options: { variant: 'compact' } }),
        text('*** {store} ***', centred(TYPEWRITER)),
        block('tracking.status', { options: { variant: 'minimal', corners: 'square' } }),
        block('tracking.ring_me', { options: { variant: 'button', corners: 'square' } }),
        block('tracking.pickup_qr', { options: { variant: 'plain' } }),
        tearLine(),
        block('tracking.timeline', { options: { variant: 'compact', corners: 'square' } }),
        block('tracking.summary', { options: { variant: 'receipt', corners: 'square' }, parts: RECEIPT_PAPER, texts: { title: 'Your receipt' } }),
        tearLine(),
        block('tracking.loyalty', { options: { variant: 'plain', corners: 'square' } }),
        block('tracking.back', { options: { variant: 'quiet' } }),
      ], { width: 480, gap: 14 }),
    ],
    { parts: RECEIPT_LOOK },
    { headingFont: 'mono', bodyFont: 'mono' },
  )
}

function buildBoldBlocks(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection('Order — bold blocks', [
        block('tracking.header', { options: { variant: 'centered' } }),
        block('tracking.status', { options: { variant: 'solid', corners: 'soft' } }),
        block('tracking.ring_me', { options: { variant: 'button', corners: 'soft' } }),
        block('tracking.pickup_qr', { options: { corners: 'soft' } }),
        block('tracking.timeline', { options: { variant: 'list', corners: 'soft' } }),
        block('tracking.summary', { options: { corners: 'soft' } }),
        block('tracking.loyalty', { options: { variant: 'solid', corners: 'soft' } }),
        block('tracking.back', { options: { variant: 'solid', corners: 'soft' } }),
      ], { width: 640, gap: 20 }),
    ],
    { parts: BOLD_LOOK },
  )
}

function buildTicketStub(): HeroDesignV5 {
  return pageDesign(
    [
      pageSection('Order — ticket', [
        block('tracking.header', { options: { variant: 'centered' } }),
        block('tracking.status', { options: { variant: 'outline', align: 'center' } }),
        block('tracking.pickup_qr'),
        tearLine(),
        block('tracking.timeline', { options: { variant: 'steps' } }),
        block('tracking.ring_me', { options: { variant: 'card' } }),
        tearLine(),
        block('tracking.summary', { parts: { p_title_align: 'center' }, texts: { title: 'Your ticket' } }),
        block('tracking.loyalty'),
        block('tracking.back', { options: { variant: 'outline' } }),
      ], { width: WIDTH, gap: 14 }),
    ],
    { parts: TICKET_LOOK },
  )
}

const SERIF_LINE: NodeStyle = { fontFamily: 'playfair-display', fontSize: 30, fontWeight: 600, lineHeight: 1.2, color: '@text' }

function buildEditorial(): HeroDesignV5 {
  const stageLine = (words: string, states: readonly string[]) => onlyWhen(text(words, centred(SERIF_LINE), { fontSize: 24 }), states)
  return pageDesign(
    [
      pageSection('Order — editorial', [
        block('tracking.header', { options: { variant: 'centered', show_live_badge: false } }),
        stageLine('Your order is in.', ['pending', 'confirmed']),
        stageLine('In the kitchen.', ['preparing']),
        stageLine('Ready for you.', ['ready']),
        stageLine('Enjoy.', ['delivered']),
        block('tracking.status', { options: { variant: 'minimal', corners: 'square' } }),
        block('tracking.ring_me', { options: { variant: 'button', corners: 'square' } }),
        block('tracking.pickup_qr', { options: { variant: 'plain' } }),
        hairline(),
        block('tracking.timeline', { options: { variant: 'list', corners: 'square' } }),
        hairline(),
        block('tracking.summary', { options: { corners: 'square' } }),
        block('tracking.loyalty', { options: { variant: 'plain', corners: 'square' } }),
        block('tracking.back', { options: { variant: 'quiet' } }),
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
  const bubble = (words: string, states: readonly string[]) => onlyWhen(text(words, BUBBLE), states)
  return pageDesign(
    [
      pageSection('Order — chat', [
        block('tracking.header', { options: { variant: 'compact' } }),
        bubble('Got your order! We’re checking it now.', ['pending', 'confirmed']),
        bubble('It’s cooking. Hang tight!', ['preparing']),
        bubble('It’s ready!', ['ready']),
        bubble('Enjoy your meal — see you again soon!', ['delivered']),
        bubble('Sorry, this order couldn’t go through. Message us and we’ll sort it out.', ['cancelled']),
        block('tracking.status', { options: { variant: 'soft', corners: 'rounded' } }),
        block('tracking.ring_me', { options: { variant: 'card', corners: 'rounded' } }),
        block('tracking.pickup_qr', { options: { corners: 'rounded' } }),
        block('tracking.timeline', { options: { variant: 'compact', corners: 'rounded' } }),
        block('tracking.summary', { options: { variant: 'compact', corners: 'rounded' }, texts: { title: 'What you ordered' } }),
        block('tracking.loyalty', { options: { variant: 'soft', corners: 'rounded' } }),
        block('tracking.back', { options: { variant: 'outline', corners: 'rounded' } }),
      ], { width: WIDTH, gap: 14 }),
    ],
    { parts: CHAT_LOOK },
  )
}

export const TRACKING_FAMILY_TEMPLATES: readonly PageTemplate[] = [
  {
    id: 'delivery-app',
    name: 'Delivery app',
    description: 'A bold status card, steps in a row and “Bill details” on soft bands.',
    category: 'delivery',
    family: 'delivery-app',
    build: buildDeliveryApp,
  },
  {
    id: 'receipt-roll',
    name: 'Receipt roll',
    description: 'Typewriter letters, a slim status, the receipt on paper and dashed tear lines.',
    category: 'playful',
    family: 'receipt-roll',
    build: buildReceiptRoll,
  },
  {
    id: 'bold-blocks',
    name: 'Bold blocks',
    description: 'A solid status card, thick frames, hard shadows and a solid back button.',
    category: 'bold',
    family: 'bold-blocks',
    build: buildBoldBlocks,
  },
  {
    id: 'ticket-stub',
    name: 'Ticket stub',
    description: 'An outlined status, the pickup code up top and dashed tear lines.',
    category: 'playful',
    family: 'ticket-stub',
    build: buildTicketStub,
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'One serif line for every stage, a slim status and hairlines.',
    category: 'branded',
    family: 'editorial',
    build: buildEditorial,
  },
  {
    id: 'chat',
    name: 'Chat',
    description: 'A speech bubble for every stage, soft cards and round corners.',
    category: 'friendly',
    family: 'chat',
    build: buildChat,
  },
]
