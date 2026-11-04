import type { PageBlockDef } from './types'

/** The thank-you page's working parts (shown right after an order is placed). */
export const CONFIRMATION_BLOCKS: readonly PageBlockDef[] = [
  {
    id: 'confirmation.status',
    page: 'confirmation',
    label: 'Order status',
    description: 'The "order sent" message — or, if the order did not go through, what to do next.',
    icon: 'CircleCheck',
    required: true,
    texts: [
      { key: 'title', label: 'Title', fallback: 'Order Confirmed!', labelKey: 'confirmation.title', maxLength: 80 },
      { key: 'subtitle', label: 'Message', fallback: 'Your order has been sent to {store}', maxLength: 200, multiline: true },
    ],
    options: [],
  },
  {
    id: 'confirmation.messenger',
    page: 'confirmation',
    label: 'Messenger',
    description: 'Sends the order to your Facebook page (only when Messenger ordering is on).',
    icon: 'MessageCircle',
    required: true,
    texts: [],
    options: [],
  },
  {
    id: 'confirmation.actions',
    page: 'confirmation',
    label: 'Track order button',
    description: 'Track your order, back to menu — or on a kiosk, start a new order.',
    icon: 'MousePointerClick',
    required: true,
    texts: [],
    options: [],
  },
  {
    id: 'confirmation.summary',
    page: 'confirmation',
    label: 'Order summary',
    description: 'The dishes, fees and total.',
    icon: 'ReceiptText',
    required: false,
    texts: [{ key: 'title', label: 'Title', fallback: 'Order Summary', labelKey: 'checkout.summary', maxLength: 60 }],
    options: [],
  },
  {
    id: 'confirmation.customer',
    page: 'confirmation',
    label: 'Customer details',
    description: 'What the customer filled in at checkout.',
    icon: 'User',
    required: false,
    texts: [{ key: 'title', label: 'Title', fallback: 'Customer Information', labelKey: 'checkout.customer', maxLength: 60 }],
    options: [],
  },
  {
    id: 'confirmation.payment',
    page: 'confirmation',
    label: 'Payment method',
    description: 'How the customer is paying, with your payment instructions.',
    icon: 'Wallet',
    required: false,
    texts: [{ key: 'title', label: 'Title', fallback: 'Payment Method', labelKey: 'checkout.payment', maxLength: 60 }],
    options: [],
  },
]

/** Today's thank-you page, top to bottom. */
export const CONFIRMATION_STANDARD_ORDER: readonly string[] = [
  'confirmation.status',
  'confirmation.summary',
  'confirmation.customer',
  'confirmation.payment',
  'confirmation.messenger',
  'confirmation.actions',
]
