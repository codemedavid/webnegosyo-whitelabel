import type { BlockOption, BlockTextSlot, PageBlockDef } from './types'

/**
 * Checkout's working parts. Every one wraps an existing checkout component
 * fed by useCheckout — a design only moves and re-words them, it never
 * changes how an order is checked or placed. Fallbacks are today's wording
 * (the Classic design, what most stores serve); a slot that shares a Branding
 * Studio label keeps its key, so earlier label edits still show.
 */

const CARD: BlockOption = { key: 'card', label: 'Show on a card', type: 'boolean', default: true }
const SHOW_SUBTITLE: BlockOption = { key: 'show_subtitle', label: 'Show the line under the title', type: 'boolean', default: true }

const title = (fallback: string, labelKey?: string, maxLength = 90): BlockTextSlot => ({
  key: 'title', label: 'Title', fallback, maxLength, ...(labelKey ? { labelKey } : {}),
})

const subtitle = (fallback: string, maxLength = 140): BlockTextSlot => ({
  key: 'subtitle', label: 'Line under the title', fallback, maxLength,
})

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
    options: [{ key: 'show_back', label: 'Show the back button', type: 'boolean', default: true }, SHOW_SUBTITLE],
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
    options: [],
  },
  {
    id: 'checkout.order_type',
    page: 'checkout',
    label: 'Order type',
    description: 'Dine-in, pickup or delivery (only when the customer has a choice).',
    icon: 'Utensils',
    required: true,
    texts: [
      title('How would you like to receive your order?', 'checkout.order_type'),
      subtitle('Choose a fulfillment method.'),
    ],
    options: [CARD, SHOW_SUBTITLE],
  },
  {
    id: 'checkout.schedule',
    page: 'checkout',
    label: 'Schedule',
    description: 'As soon as possible or later (only when advance orders are on).',
    icon: 'CalendarClock',
    required: true,
    texts: [
      title('When would you like it?', undefined, 60),
      { key: 'asap_title', label: '"Now" choice', fallback: 'As soon as possible', maxLength: 40 },
      { key: 'asap_subtitle', label: '"Now" choice, details', fallback: 'Prepare my order now', maxLength: 60 },
      { key: 'later_title', label: '"Later" choice', fallback: 'Schedule for later', maxLength: 40 },
      { key: 'later_subtitle', label: '"Later" choice, details', fallback: 'Pick a date & time', maxLength: 60 },
      { key: 'later_required', label: '"Later" details when it must be scheduled', fallback: 'Advance order required', maxLength: 60 },
    ],
    options: [CARD],
  },
  {
    id: 'checkout.customer',
    page: 'checkout',
    label: 'Customer details',
    description: 'Name, phone, address and your own checkout questions.',
    icon: 'User',
    required: true,
    texts: [
      title('Customer Information', 'checkout.customer', 48),
      subtitle('Please provide the following details'),
    ],
    options: [CARD, SHOW_SUBTITLE],
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
    required: true,
    texts: [
      title('Order Summary', 'checkout.summary', 48),
      subtitle('Review your order before checkout'),
      { key: 'subtotal', label: 'Subtotal', fallback: 'Subtotal', maxLength: 30 },
      { key: 'delivery_fee', label: 'Delivery fee', fallback: 'Delivery Fee', maxLength: 30 },
      { key: 'service_charge', label: 'Service charge', fallback: 'Service Charge', maxLength: 30 },
      { key: 'discount', label: 'Discount', fallback: 'Discount', maxLength: 30 },
      { key: 'total', label: 'Total', fallback: 'Total', labelKey: 'checkout.total', maxLength: 24 },
    ],
    options: [CARD, SHOW_SUBTITLE, { key: 'show_items', label: 'List the dishes', type: 'boolean', default: true }],
  },
  {
    id: 'checkout.voucher',
    page: 'checkout',
    label: 'Voucher code',
    description: 'Where customers type a voucher or promo code. Without it, no code can be entered.',
    icon: 'TicketPercent',
    required: false,
    texts: [{ key: 'label', label: 'Prompt', fallback: 'Have a voucher?', labelKey: 'checkout.voucher', maxLength: 48 }],
    options: [CARD],
  },
  {
    id: 'checkout.gov_discount',
    page: 'checkout',
    label: 'Senior / PWD',
    description: 'The Senior Citizen / PWD discount or the "show your ID" note (only when you set it up).',
    icon: 'BadgePercent',
    required: true,
    texts: [],
    options: [CARD],
  },
  {
    id: 'checkout.payment',
    page: 'checkout',
    label: 'Payment methods',
    description: 'How the customer pays.',
    icon: 'Wallet',
    required: true,
    texts: [
      title('Payment', 'checkout.payment', 48),
      subtitle('Choose how you would like to pay'),
    ],
    options: [CARD, SHOW_SUBTITLE],
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
    options: [],
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
    options: [
      { key: 'show_total', label: 'Show the total on the button', type: 'boolean', default: true },
      { ...CARD, default: false },
    ],
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
