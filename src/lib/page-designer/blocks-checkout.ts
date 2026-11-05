import {
  CARD,
  CUSTOMER_OPTIONS,
  GOV_DISCOUNT_OPTIONS,
  HEADER_OPTIONS,
  PAYMENT_OPTIONS,
  PLACE_ORDER_OPTIONS,
  SCHEDULE_OPTIONS,
  SHOW_SUBTITLE,
  SMS_OPT_IN_OPTIONS,
  STORE_CLOSED_OPTIONS,
  SUMMARY_OPTIONS,
  VOUCHER_OPTIONS,
} from './checkout-block-options'
import { checkoutColorKnobs } from './checkout-colors'
import { choiceKnob, CORNERS_KNOB, designKnob } from './knobs'
import { ORDER_TYPE_WORDING_TEXTS, orderTypeIconOptions } from './order-type-wording'
import type { BlockOption, BlockTextSlot, PageBlockDef } from './types'

/**
 * Checkout's working parts. Every one wraps an existing checkout component
 * fed by useCheckout — a design only moves and re-words them, it never
 * changes how an order is checked or placed. Fallbacks are today's wording
 * (the Classic design, what most stores serve); a slot that shares a Branding
 * Studio label keeps its key, so earlier label edits still show.
 */

const title = (fallback: string, labelKey?: string, maxLength = 90): BlockTextSlot => ({
  key: 'title', label: 'Title', fallback, maxLength, ...(labelKey ? { labelKey } : {}),
})

const subtitle = (fallback: string, maxLength = 140): BlockTextSlot => ({
  key: 'subtitle', label: 'Line under the title', fallback, maxLength,
})

/** The order-type designs, in gallery order; the first is the standard tiles. */
const ORDER_TYPE_DESIGN = designKnob([
  { value: 'tiles', label: 'Tiles', hint: 'Side by side, with icons' },
  { value: 'segmented', label: 'Pill toggle', hint: 'Best for two choices' },
  { value: 'list', label: 'List', hint: 'Rows with the details' },
  { value: 'cards', label: 'Cards', hint: 'Room for longer details' },
  { value: 'buttons', label: 'Big buttons', hint: 'Easy to tap' },
  { value: 'chips', label: 'Chips', hint: 'Small, for kiosks and tables' },
  { value: 'photo', label: 'Photos', hint: 'A picture for each way' },
  { value: 'tabs', label: 'Tabs', hint: 'Underlined, like app tabs' },
  { value: 'switch', label: 'Switch', hint: 'For exactly two ways (else tiles)' },
  { value: 'expanding', label: 'Expanding', hint: 'The chosen way opens its details' },
  { value: 'swipe', label: 'Swipe cards', hint: 'Big cards to swipe through' },
  { value: 'ticket', label: 'Tickets', hint: 'Ticket stubs, stamped when picked' },
  { value: 'doors', label: 'Doors', hint: 'Tall halves, kiosk style' },
])

/** The designs added in v3 (they draw icons and details like the first ones). */
const V3_ORDER_TYPE_DESIGNS = ['tabs', 'switch', 'expanding', 'swipe', 'ticket', 'doors'] as const
const NOT_PHOTO = ['tiles', 'segmented', 'list', 'cards', 'buttons', 'chips', ...V3_ORDER_TYPE_DESIGNS] as const
const photoOnly = { showWhen: { key: 'variant', values: ['photo'] } }

const image = (key: string, label: string): BlockOption => ({ key, label, type: 'image', default: '', ...photoOnly })

const ORDER_TYPE_OPTIONS: readonly BlockOption[] = [
  ORDER_TYPE_DESIGN,
  ...checkoutColorKnobs(['color_accent', 'color_card', 'color_text', 'color_border'], { color_accent: 'Chosen option', color_card: 'Options' }),
  CORNERS_KNOB,
  choiceKnob('icon_style', 'Icons', [
    { value: 'circle', label: 'In a circle' },
    { value: 'plain', label: 'Plain' },
    { value: 'none', label: 'None' },
  ], { showWhen: { key: 'variant', values: NOT_PHOTO } }),
  { key: 'show_descriptions', label: 'Show each way’s details', type: 'boolean', default: true, hint: 'The description you wrote for dine-in, pickup or delivery.', showWhen: { key: 'variant', values: ['tiles', 'segmented', 'list', 'cards', 'buttons', 'photo', ...V3_ORDER_TYPE_DESIGNS] } },
  choiceKnob('columns', 'Across', [
    { value: 'auto', label: 'Auto' },
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
  ], { showWhen: { key: 'variant', values: ['tiles', 'photo'] } }),
  choiceKnob('align', 'Text', [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Centre' },
  ], { showWhen: { key: 'variant', values: ['buttons'] } }),
  image('image_dine_in', 'Dine-in photo'),
  image('image_pickup', 'Pickup photo'),
  image('image_delivery', 'Delivery photo'),
  { ...image('image_other', 'Other photo'), hint: 'For Grab, foodpanda and your other ways.' },
  ...orderTypeIconOptions(),
  CARD,
  SHOW_SUBTITLE,
]

/**
 * The parts a choice block marks (see parts.ts) beyond the shared card and
 * wording: its options (with the chosen and hovered states), their names and
 * details, icons, the chosen tick and small chips.
 */
const CHOICE_PARTS = ['option', 'option_on', 'option_hover', 'option_label', 'option_desc', 'icon', 'icon_on', 'tick', 'badge'] as const

export const CHECKOUT_BLOCKS: readonly PageBlockDef[] = [
  {
    id: 'checkout.header',
    page: 'checkout',
    label: 'Page header',
    description: 'The back-to-cart button with the Checkout title.',
    icon: 'ArrowLeft',
    required: false,
    texts: [
      title('Checkout', 'checkout.title', 48),
      subtitle('Complete your order', 90),
    ],
    options: HEADER_OPTIONS,
    parts: ['banner', 'button_alt'],
  },
  {
    id: 'checkout.store_closed',
    page: 'checkout',
    label: 'Store closed notice',
    description: 'Tells customers when you are not taking orders (shows only while closed).',
    icon: 'Store',
    required: false,
    texts: [
      { key: 'closed', label: 'Closed message', fallback: 'Ordering is currently closed', maxLength: 80 },
      { key: 'prelaunch', label: 'Before launch', fallback: 'Opening soon', maxLength: 60 },
      { key: 'prelaunch_detail', label: 'Before launch, details', fallback: "This store isn't taking orders yet", maxLength: 120 },
    ],
    options: STORE_CLOSED_OPTIONS,
    parts: ['icon'],
  },
  {
    id: 'checkout.order_type',
    page: 'checkout',
    label: 'Order type',
    description: 'Dine-in, pickup or delivery (only when the customer has a choice).',
    icon: 'Utensils',
    required: false,
    neededWhen: 'order_choice',
    texts: [
      title('How would you like to receive your order?', 'checkout.order_type'),
      subtitle('Choose a fulfillment method.'),
      ...ORDER_TYPE_WORDING_TEXTS,
    ],
    options: ORDER_TYPE_OPTIONS,
    // `divider`: the tabs' track line and the tickets' perforation.
    parts: [...CHOICE_PARTS, 'divider'],
  },
  {
    id: 'checkout.schedule',
    page: 'checkout',
    label: 'Schedule',
    description: 'As soon as possible or later (only when advance orders are on).',
    icon: 'CalendarClock',
    required: false,
    neededWhen: 'scheduling',
    texts: [
      title('When would you like it?', undefined, 60),
      { key: 'asap_title', label: '"Now" choice', fallback: 'As soon as possible', maxLength: 40 },
      { key: 'asap_subtitle', label: '"Now" choice, details', fallback: 'Prepare my order now', maxLength: 60 },
      { key: 'later_title', label: '"Later" choice', fallback: 'Schedule for later', maxLength: 40 },
      { key: 'later_subtitle', label: '"Later" choice, details', fallback: 'Pick a date & time', maxLength: 60 },
      { key: 'later_required', label: '"Later" details when it must be scheduled', fallback: 'Advance order required', maxLength: 60 },
    ],
    options: SCHEDULE_OPTIONS,
    parts: [...CHOICE_PARTS.filter((part) => part !== 'badge'), 'label', 'banner'],
  },
  {
    id: 'checkout.customer',
    page: 'checkout',
    label: 'Customer details',
    description: 'Name, phone, address and your own checkout questions.',
    icon: 'User',
    required: false,
    neededWhen: 'questions',
    texts: [
      title('Customer Information', 'checkout.customer', 48),
      subtitle('Please provide the following details'),
    ],
    options: CUSTOMER_OPTIONS,
    parts: ['field', 'label', 'error'],
  },
  {
    id: 'checkout.loyalty',
    page: 'checkout',
    label: 'Loyalty progress',
    description: 'How close the customer is to a reward (only when you run a loyalty program).',
    icon: 'Stamp',
    required: false,
    texts: [],
    options: [],
  },
  {
    id: 'checkout.summary',
    page: 'checkout',
    label: 'Order summary',
    description: 'The dishes, fees, discounts and total.',
    icon: 'ReceiptText',
    required: false,
    texts: [
      title('Order Summary', 'checkout.summary', 48),
      subtitle('Review your order before checkout'),
      { key: 'subtotal', label: 'Subtotal', fallback: 'Subtotal', maxLength: 30 },
      { key: 'delivery_fee', label: 'Delivery fee', fallback: 'Delivery Fee', maxLength: 30 },
      { key: 'service_charge', label: 'Service charge', fallback: 'Service Charge', maxLength: 30 },
      { key: 'discount', label: 'Discount', fallback: 'Discount', maxLength: 30 },
      { key: 'total', label: 'Total', fallback: 'Total', labelKey: 'checkout.total', maxLength: 24 },
    ],
    options: SUMMARY_OPTIONS,
    parts: ['price', 'divider', 'total', 'badge', 'error', 'link'],
  },
  {
    id: 'checkout.voucher',
    page: 'checkout',
    label: 'Voucher code',
    description: 'Where customers type a voucher or promo code. Remove it only if you never hand out codes — without it customers can’t enter one.',
    icon: 'TicketPercent',
    required: false,
    texts: [{ key: 'label', label: 'Prompt', fallback: 'Have a voucher?', labelKey: 'checkout.voucher', maxLength: 48 }],
    options: VOUCHER_OPTIONS,
    parts: ['field', 'label', 'button_alt', 'price', 'error', 'link'],
  },
  {
    id: 'checkout.gov_discount',
    page: 'checkout',
    label: 'Senior / PWD',
    description: 'The Senior Citizen / PWD discount or the "show your ID" note (only when you set it up).',
    icon: 'BadgePercent',
    required: false,
    neededWhen: 'gov_claims',
    texts: [],
    options: GOV_DISCOUNT_OPTIONS,
    parts: ['option', 'option_on', 'option_hover', 'field', 'label', 'error', 'button', 'button_alt', 'link'],
  },
  {
    id: 'checkout.payment',
    page: 'checkout',
    label: 'Payment methods',
    description: 'How the customer pays.',
    icon: 'Wallet',
    required: false,
    neededWhen: 'payment',
    texts: [
      title('Payment', 'checkout.payment', 48),
      subtitle('Choose how you would like to pay'),
      { key: 'split_now', label: '“Pay now” choice', fallback: 'Pay now', maxLength: 40, hint: 'The Pay now / later design only.' },
      {
        key: 'split_in_person',
        label: '“Pay in person” choice',
        fallback: '',
        maxLength: 40,
        hint: 'The Pay now / later design only. Blank says “Pay at the counter”, or “Pay on delivery” for delivery.',
      },
    ],
    options: PAYMENT_OPTIONS,
    // `option_desc`: the methods listed under each Pay now / later choice.
    parts: [...CHOICE_PARTS, 'link'],
  },
  {
    id: 'checkout.sms_opt_in',
    page: 'checkout',
    label: 'Text me offers',
    description: 'The tick box for texts from your store. Never ticked for the customer.',
    icon: 'MessageSquare',
    required: false,
    texts: [
      {
        key: 'label',
        label: 'Tick box wording',
        fallback: 'Text me updates and offers from {store}. Standard message rates apply, and you can opt out any time.',
        maxLength: 240,
        multiline: true,
        hint: 'Say plainly that you will text them — this is their consent.',
      },
    ],
    options: SMS_OPT_IN_OPTIONS,
  },
  {
    id: 'checkout.place_order',
    page: 'checkout',
    label: 'Place order button',
    description: 'The button that sends the order, with the minimum-order note.',
    icon: 'ShoppingBag',
    required: true,
    texts: [
      { key: 'footer', label: 'Note under the button', fallback: 'Your order will be sent to the restaurant for confirmation', maxLength: 160, multiline: true },
      { key: 'processing', label: 'While sending', fallback: 'Processing Order...', maxLength: 40 },
    ],
    options: PLACE_ORDER_OPTIONS,
    parts: ['button', 'error'],
  },
]

/** Today's checkout, top to bottom. */
export const CHECKOUT_STANDARD_ORDER: readonly string[] = [
  'checkout.header',
  'checkout.store_closed',
  'checkout.order_type',
  'checkout.schedule',
  'checkout.customer',
  'checkout.loyalty',
  'checkout.summary',
  'checkout.voucher',
  'checkout.gov_discount',
  'checkout.payment',
  'checkout.sms_opt_in',
  'checkout.place_order',
]
