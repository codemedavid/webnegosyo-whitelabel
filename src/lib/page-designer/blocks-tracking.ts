import type { PageBlockDef } from './types'

/**
 * The order-tracking page's working parts. Text slots that share a
 * Branding Studio label keep its key, so earlier label edits still show.
 */
export const TRACKING_BLOCKS: readonly PageBlockDef[] = [
  {
    id: 'tracking.header',
    page: 'tracking',
    label: 'Store header',
    description: 'Your logo, the order number and the live badge.',
    icon: 'Store',
    required: false,
    texts: [],
    options: [{ key: 'show_live_badge', label: 'Show the live badge', type: 'boolean', default: true }],
  },
  {
    id: 'tracking.status',
    page: 'tracking',
    label: 'Order status',
    description: 'The big status card with the progress bar and ready time.',
    icon: 'ChefHat',
    required: true,
    texts: [{ key: 'greeting', label: 'Greeting', fallback: 'Hi {name}!', maxLength: 80, hint: 'Shown when the customer gave a name.' }],
    options: [],
  },
  {
    id: 'tracking.ring_me',
    page: 'tracking',
    label: 'Ring me when ready',
    description: 'Lets the customer turn on an alarm for when the order is ready.',
    icon: 'BellRing',
    required: false,
    texts: [],
    options: [],
  },
  {
    id: 'tracking.loyalty',
    page: 'tracking',
    label: 'Loyalty card',
    description: 'The stamp card, rewards and wallet buttons (only when you run a loyalty program).',
    icon: 'Stamp',
    required: false,
    texts: [],
    options: [],
  },
  {
    id: 'tracking.pickup_qr',
    page: 'tracking',
    label: 'Pickup QR',
    description: 'The code staff scan at pickup (only on pickup orders when scan-to-confirm is on).',
    icon: 'QrCode',
    required: false,
    texts: [],
    options: [],
  },
  {
    id: 'tracking.timeline',
    page: 'tracking',
    label: 'Progress timeline',
    description: 'Every step of the order, ticked off as it happens.',
    icon: 'ListChecks',
    required: false,
    texts: [],
    options: [],
  },
  {
    id: 'tracking.summary',
    page: 'tracking',
    label: 'Order summary',
    description: 'The dishes, fees and total.',
    icon: 'ReceiptText',
    required: false,
    texts: [],
    options: [],
  },
  {
    id: 'tracking.back',
    page: 'tracking',
    label: 'Back to menu',
    description: 'A button back to your menu.',
    icon: 'ArrowLeft',
    required: false,
    texts: [{ key: 'label', label: 'Button text', fallback: 'Back to menu', labelKey: 'tracking.back', maxLength: 40 }],
    options: [],
  },
]

/** Today's tracking page, top to bottom: the standard design starts from this. */
export const TRACKING_STANDARD_ORDER: readonly string[] = [
  'tracking.header',
  'tracking.status',
  'tracking.ring_me',
  'tracking.loyalty',
  'tracking.pickup_qr',
  'tracking.timeline',
  'tracking.summary',
  'tracking.back',
]
