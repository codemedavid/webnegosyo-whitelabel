import { choiceKnob, designKnob } from './knobs'
import { FOLLOW_PAGE, TRACKING_CORNERS_KNOB, trackingColorKnob, trackingColorKnobs } from './tracking-colors'
import type { BlockOption, PageBlockDef } from './types'

// Designs and settings per block. The first design (and every default) is the
// block as it looked before designs existed. `page` = "Same as the Look tab":
// the block follows the store-wide look (tracking_style); the other designs
// override it for this block only.

const SAME_AS_LOOK = { value: FOLLOW_PAGE, label: 'Same as the Look tab', hint: 'Follows your page look' }
const when = (key: string, values: readonly (string | boolean)[]) => ({ showWhen: { key, values } })
const toggle = (key: string, label: string, extra: Partial<BlockOption> = {}): BlockOption =>
  ({ key, label, type: 'boolean', default: true, ...extra }) as BlockOption

const HEADER_OPTIONS: readonly BlockOption[] = [
  designKnob([
    { value: 'standard', label: 'Standard', hint: 'Logo and name on the left' },
    { value: 'centered', label: 'Centred', hint: 'Your name in the middle' },
    { value: 'compact', label: 'Compact', hint: 'One slim line' },
  ]),
  ...trackingColorKnobs(['color_header', 'color_header_text', 'color_live']),
  { key: 'show_live_badge', label: 'Show the live badge', type: 'boolean', default: true },
  toggle('show_logo', 'Show your logo'),
  toggle('show_store_name', 'Store name'),
  toggle('show_order_number', 'Order number'),
]

const STATUS_OPTIONS: readonly BlockOption[] = [
  designKnob([
    SAME_AS_LOOK,
    { value: 'gradient', label: 'Gradient', hint: 'Two shades of your colour' },
    { value: 'solid', label: 'Solid', hint: 'One bold colour' },
    { value: 'soft', label: 'Soft tint', hint: 'A light wash of colour' },
    { value: 'outline', label: 'Outlined', hint: 'A card with a coloured edge' },
    { value: 'minimal', label: 'Minimal', hint: 'A slim card, no banner' },
  ]),
  trackingColorKnob('color_banner'),
  trackingColorKnob('color_banner_end', when('variant', [FOLLOW_PAGE, 'gradient'])),
  ...trackingColorKnobs(['color_banner_text', 'color_bar']),
  trackingColorKnob('color_cancelled', { group: 'advanced' }),
  TRACKING_CORNERS_KNOB,
  choiceKnob('align', 'Text', [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Centre' },
  ]),
  toggle('show_greeting', 'Show the greeting'),
  toggle('show_placed', 'Show when it was placed'),
  toggle('show_progress', 'Progress bar', { hint: 'The short bar of steps under the status.' }),
  toggle('show_ready_time', 'Ready time', { hint: 'When the kitchen sets one: "Ready by 6:30 PM".' }),
  toggle('show_decor', 'Background circles', { group: 'advanced', ...when('variant', [FOLLOW_PAGE, 'gradient', 'solid', 'soft', 'outline']) }),
]

const RING_OPTIONS: readonly BlockOption[] = [
  designKnob([
    { value: 'button', label: 'Button', hint: 'One wide button' },
    { value: 'card', label: 'Card', hint: 'A card with a bell' },
  ]),
  ...trackingColorKnobs(['color_ring', 'color_ring_text', 'color_ring_border', 'color_ring_armed']),
  TRACKING_CORNERS_KNOB,
  toggle('show_helper', 'Tip after tapping', { hint: '"Keep this page open and your volume up."' }),
]

const LOYALTY_OPTIONS: readonly BlockOption[] = [
  designKnob([
    SAME_AS_LOOK,
    { value: 'gradient', label: 'Gradient band', hint: 'Two shades across the top' },
    { value: 'solid', label: 'Solid band', hint: 'One bold colour' },
    { value: 'soft', label: 'Soft band', hint: 'A light wash of colour' },
    { value: 'plain', label: 'Plain', hint: 'No coloured band' },
  ]),
  ...trackingColorKnobs(['color_loyalty', 'color_loyalty_text']),
  trackingColorKnob('color_band', when('variant', [FOLLOW_PAGE, 'gradient', 'solid', 'soft'])),
  trackingColorKnob('color_band_end', when('variant', [FOLLOW_PAGE, 'gradient'])),
  trackingColorKnob('color_band_text', when('variant', [FOLLOW_PAGE, 'gradient', 'solid', 'soft'])),
  ...trackingColorKnobs(['color_stamp', 'color_loyalty_button']),
  trackingColorKnob('color_loyalty_border', { group: 'advanced' }),
  trackingColorKnob('color_loyalty_button_text', { group: 'advanced' }),
  TRACKING_CORNERS_KNOB,
  choiceKnob('stamp_shape', 'Stamps', [
    { value: FOLLOW_PAGE, label: 'Same as page' },
    { value: 'circle', label: 'Circle' },
    { value: 'rounded', label: 'Rounded' },
    { value: 'square', label: 'Square' },
  ]),
  choiceKnob('stamp_fill', 'An earned stamp shows', [
    { value: FOLLOW_PAGE, label: 'Same as page' },
    { value: 'logo', label: 'Your logo' },
    { value: 'check', label: 'A tick' },
  ], { group: 'advanced' }),
]

const PICKUP_OPTIONS: readonly BlockOption[] = [
  designKnob([
    { value: 'card', label: 'Card', hint: 'The code on a card' },
    { value: 'plain', label: 'Plain', hint: 'Just the code' },
  ]),
  trackingColorKnob('color_pickup', when('variant', ['card'])),
  trackingColorKnob('color_pickup_border', when('variant', ['card'])),
  ...trackingColorKnobs(['color_pickup_text', 'color_pickup_ready']),
  TRACKING_CORNERS_KNOB,
  toggle('show_title', 'Title', { hint: '"Your collection code" above the code.' }),
  toggle('show_helper', 'Help text', { hint: 'The line under the code saying staff will scan it.' }),
]

const TIMELINE_OPTIONS: readonly BlockOption[] = [
  designKnob([
    { value: 'list', label: 'List', hint: 'Every step, top to bottom' },
    { value: 'steps', label: 'Steps', hint: 'Side by side, in one row' },
    { value: 'compact', label: 'Compact', hint: 'A short list' },
  ]),
  ...trackingColorKnobs(['color_done', 'color_current', 'color_upcoming', 'color_card']),
  TRACKING_CORNERS_KNOB,
  toggle('show_title', 'Show the title'),
  toggle('show_details', 'Show what each step means', when('variant', ['list', 'steps'])),
]

const SUMMARY_OPTIONS: readonly BlockOption[] = [
  designKnob([
    { value: 'standard', label: 'Standard', hint: 'Every dish with its price' },
    { value: 'receipt', label: 'Receipt', hint: 'Like a printed receipt' },
    { value: 'compact', label: 'Fold-away', hint: 'The total, tap to see the dishes' },
  ]),
  ...trackingColorKnobs(['color_card', 'color_text', 'color_total']),
  trackingColorKnob('color_badge', when('variant', ['standard'])),
  trackingColorKnob('color_border', { group: 'advanced' }),
  TRACKING_CORNERS_KNOB,
  toggle('show_title', 'Title'),
  toggle('show_addons', 'Add-ons'),
  toggle('show_fees', 'Delivery fee and service charge'),
]

const BACK_OPTIONS: readonly BlockOption[] = [
  designKnob([
    { value: 'quiet', label: 'Quiet', hint: 'Soft text with an arrow' },
    { value: 'outline', label: 'Outlined', hint: 'A button with an edge' },
    { value: 'solid', label: 'Solid', hint: 'A bold button' },
  ]),
  trackingColorKnob('color_muted', { label: 'Text', ...when('variant', ['quiet']) }),
  trackingColorKnob('color_accent', { label: 'Button', ...when('variant', ['outline', 'solid']) }),
  { ...TRACKING_CORNERS_KNOB, ...when('variant', ['outline', 'solid']) } as BlockOption,
]

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
    texts: [
      { key: 'order_label', label: 'Order number line', fallback: 'Order {order_number}', maxLength: 40, hint: '{order_number} is the order’s number, e.g. #07.' },
      { key: 'live', label: 'Live badge', fallback: 'Live', maxLength: 16 },
    ],
    options: HEADER_OPTIONS,
    parts: ['banner', 'icon', 'badge'],
  },
  {
    id: 'tracking.status',
    page: 'tracking',
    label: 'Order status',
    description: 'The big status card with the progress bar and ready time.',
    icon: 'ChefHat',
    required: true,
    texts: [
      { key: 'greeting', label: 'Greeting', fallback: 'Hi {name}!', maxLength: 80, hint: 'Shown when the customer gave a name.' },
      { key: 'greeting_guest', label: 'Greeting (no name)', fallback: 'Hi there!', maxLength: 80, hint: 'Shown when the customer gave no name.' },
      { key: 'placed', label: '“Placed” before the time', fallback: 'Placed', maxLength: 24 },
      { key: 'scheduled', label: '“Scheduled for” before the time', fallback: 'Scheduled for', maxLength: 32 },
      { key: 'cancelled_headline', label: 'Cancelled — headline', fallback: 'Order cancelled', labelKey: 'tracking.cancelled_headline', maxLength: 48 },
      { key: 'cancelled_detail', label: 'Cancelled — detail', fallback: 'This order has been cancelled.', labelKey: 'tracking.cancelled_detail', maxLength: 90, multiline: true },
    ],
    options: STATUS_OPTIONS,
    parts: ['banner', 'icon', 'badge', 'step', 'step_on', 'step_done'],
  },
  {
    id: 'tracking.ring_me',
    page: 'tracking',
    label: 'Ring me when ready',
    description: 'Lets the customer turn on an alarm for when the order is ready.',
    icon: 'BellRing',
    required: false,
    texts: [
      { key: 'label', label: 'Button text', fallback: 'Ring me when my order is ready', labelKey: 'tracking.ring_me', maxLength: 48 },
      { key: 'armed', label: 'After tapping', fallback: "We'll ring & vibrate when it's ready", labelKey: 'tracking.ring_armed', maxLength: 48 },
      { key: 'armed_hint', label: 'Hint after tapping', fallback: 'Keep this page open and your volume up.', maxLength: 90 },
    ],
    options: RING_OPTIONS,
    parts: ['button', 'icon'],
  },
  {
    id: 'tracking.loyalty',
    page: 'tracking',
    label: 'Loyalty card',
    description: 'The stamp card, rewards and wallet buttons (only when you run a loyalty program).',
    icon: 'Stamp',
    required: false,
    texts: [],
    options: LOYALTY_OPTIONS,
    parts: ['banner', 'icon', 'field', 'label', 'error', 'button', 'link', 'badge'],
  },
  {
    id: 'tracking.pickup_qr',
    page: 'tracking',
    label: 'Pickup QR',
    description: 'The code staff scan at pickup (only on pickup orders when scan-to-confirm is on).',
    icon: 'QrCode',
    required: false,
    texts: [],
    options: PICKUP_OPTIONS,
    parts: [],
  },
  {
    id: 'tracking.timeline',
    page: 'tracking',
    label: 'Progress timeline',
    description: 'Every step of the order, ticked off as it happens.',
    icon: 'ListChecks',
    required: false,
    texts: [{ key: 'title', label: 'Title', fallback: 'Progress', labelKey: 'tracking.progress_title', maxLength: 24 }],
    options: TIMELINE_OPTIONS,
    parts: ['step', 'step_on', 'step_done'],
  },
  {
    id: 'tracking.summary',
    page: 'tracking',
    label: 'Order summary',
    description: 'The dishes, fees and total.',
    icon: 'ReceiptText',
    required: false,
    texts: [
      { key: 'title', label: 'Title', fallback: 'Your order', labelKey: 'tracking.summary_title', maxLength: 24 },
      { key: 'delivery_fee', label: 'Delivery fee', fallback: 'Delivery fee', maxLength: 32 },
      { key: 'service_charge', label: 'Service charge', fallback: 'Service charge', maxLength: 32 },
      { key: 'total', label: 'Total', fallback: 'Total', maxLength: 24 },
    ],
    options: SUMMARY_OPTIONS,
    parts: ['badge', 'price', 'total', 'divider'],
  },
  {
    id: 'tracking.back',
    page: 'tracking',
    label: 'Back to menu',
    description: 'A button back to your menu.',
    icon: 'ArrowLeft',
    required: false,
    texts: [{ key: 'label', label: 'Button text', fallback: 'Back to menu', labelKey: 'tracking.back', maxLength: 40 }],
    options: BACK_OPTIONS,
    parts: ['button', 'button_alt'],
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
