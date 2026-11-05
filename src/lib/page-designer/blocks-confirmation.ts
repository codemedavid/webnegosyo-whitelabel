import { checkoutColorKnobs } from './checkout-colors'
import { choiceKnob, designKnob } from './knobs'
import type { BlockOption, PageBlockDef } from './types'

// ── Designs and colours ─────────────────────────────────────────────────────
// Every block's first design (and every setting's default) is the block as it
// looked before designs existed, so a stored design without them is unchanged.
// Choice values are stored in designs: never rename one.

/** Shows a setting only for some of the block's designs. */
const forDesigns = (...values: string[]) => ({ showWhen: { key: 'variant', values } })

const BUTTON_SHAPE: BlockOption = choiceKnob('button_shape', 'Button shape', [
  { value: 'pill', label: 'Pill' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'square', label: 'Square' },
])

const STATUS_OPTIONS: readonly BlockOption[] = [
  designKnob([
    { value: 'centered', label: 'Big tick', hint: 'Centred, with a large tick' },
    { value: 'banner', label: 'Banner', hint: 'A coloured band across the top' },
    { value: 'card', label: 'Card', hint: 'Left-aligned, on a card' },
    { value: 'celebration', label: 'Celebration', hint: 'A big, happy picture' },
  ]),
  { ...checkoutColorKnobs(['color_accent'], { color_accent: 'Icon' })[0], ...forDesigns('card', 'celebration') },
  ...checkoutColorKnobs(['color_button', 'color_button_text'], { color_button: 'Banner', color_button_text: 'Banner text' })
    .map((knob) => ({ ...knob, ...forDesigns('banner') })),
  ...checkoutColorKnobs(['color_text']),
  { key: 'show_icon', label: 'Show the big tick', type: 'boolean', default: true, hint: 'The tick or picture above the title.' },
]

const MESSENGER_OPTIONS: readonly BlockOption[] = [
  ...checkoutColorKnobs(['color_card', 'color_text', 'color_accent', 'color_button', 'color_button_text'], { color_accent: 'Links' }),
  BUTTON_SHAPE,
]

const ACTIONS_OPTIONS: readonly BlockOption[] = [
  designKnob([
    { value: 'stacked', label: 'Stacked', hint: 'Full-width buttons, one under the other' },
    { value: 'side', label: 'Side by side', hint: 'Both buttons on one row' },
    { value: 'outline', label: 'Outlined', hint: 'Back to Menu gets an outline' },
  ]),
  ...checkoutColorKnobs(['color_button', 'color_button_text']),
  BUTTON_SHAPE,
  { key: 'show_back', label: 'Show "Back to Menu"', type: 'boolean', default: true },
]

const SUMMARY_OPTIONS: readonly BlockOption[] = [
  designKnob([
    { value: 'standard', label: 'Standard', hint: 'Every dish with its details' },
    { value: 'receipt', label: 'Receipt', hint: 'Looks like a printed receipt' },
    { value: 'compact', label: 'Compact', hint: 'Smaller, takes less room' },
  ]),
  ...checkoutColorKnobs(['color_card', 'color_text', 'color_accent'], { color_accent: 'Total' }),
  { key: 'show_order_type', label: 'Show the order type', type: 'boolean', default: true },
]

/** Customer details + payment method share their designs. */
const DETAILS_OPTIONS: readonly BlockOption[] = [
  designKnob([
    { value: 'card', label: 'Card', hint: 'On a card, like the rest of the page' },
    { value: 'plain', label: 'Plain list', hint: 'No card, just the lines' },
    { value: 'compact', label: 'Compact', hint: 'A smaller card' },
  ]),
  ...checkoutColorKnobs(['color_card']).map((knob) => ({ ...knob, ...forDesigns('card', 'compact') })),
  ...checkoutColorKnobs(['color_text', 'color_border']),
]

/**
 * The thank-you page's working parts (shown right after an order is placed).
 * Every fallback is today's exact wording on the standard page. `{seconds}`
 * in a countdown line becomes the live number ("3s"); `{store}` the store name.
 */
export const CONFIRMATION_BLOCKS: readonly PageBlockDef[] = [
  {
    id: 'confirmation.status',
    page: 'confirmation',
    label: 'Order status',
    description: 'The "order sent" message — or, if the order did not go through, what to do next.',
    icon: 'CircleCheck',
    required: true,
    texts: [
      { key: 'title', label: 'Title', fallback: 'Order Placed!', labelKey: 'confirmation.title', maxLength: 80 },
      { key: 'subtitle', label: 'Message', fallback: 'Your order has been sent to {store}', maxLength: 200, multiline: true },
      { key: 'failed_title', label: 'Title (not confirmed)', fallback: 'Order Not Confirmed', maxLength: 80 },
      { key: 'failed_subtitle', label: 'Message (not confirmed)', fallback: 'We could not reach {store} with this order.', maxLength: 200, multiline: true },
      { key: 'refused_help', label: 'Help (store said no)', fallback: 'Nothing has been sent to the store. Please adjust your order and try again.', maxLength: 200, multiline: true },
      { key: 'messenger_help', label: 'Help (send on Messenger)', fallback: 'Please send the Messenger message below so they receive it.', maxLength: 200, multiline: true },
      { key: 'contact_help', label: 'Help (contact the store)', fallback: 'Nothing has been sent yet — please contact the store directly to place this order.', maxLength: 200, multiline: true },
    ],
    options: STATUS_OPTIONS,
    parts: ['banner', 'icon'],
  },
  {
    id: 'confirmation.messenger',
    page: 'confirmation',
    label: 'Messenger',
    description: 'Sends the order to your Facebook page (only when Messenger ordering is on). Optional: most stores no longer use Messenger.',
    icon: 'MessageCircle',
    // Optional (owner, 2026-11-05): most stores no longer take orders on Messenger.
    required: false,
    texts: [
      { key: 'countdown', label: 'Countdown', fallback: 'Redirecting to Messenger in {seconds}...', maxLength: 120, hint: '{seconds} shows the seconds left.' },
      { key: 'opened', label: 'After opening', fallback: 'Messenger should have opened in a new tab.', maxLength: 120 },
      { key: 'button', label: 'Button text', fallback: 'Go to Messenger', maxLength: 40 },
      { key: 'or', label: 'Divider', fallback: 'or', maxLength: 20 },
      { key: 'copy_link', label: 'Copy link', fallback: 'Copy order text and paste it directly on Messenger', maxLength: 120 },
      { key: 'no_page', label: 'No page connected', fallback: 'Copy the order message and send it to the restaurant.', maxLength: 160 },
      { key: 'copy_button', label: 'Copy button', fallback: 'Copy Order Message', maxLength: 40 },
      { key: 'message_title', label: 'Message box title', fallback: 'Order Message', maxLength: 60 },
      { key: 'message_hint', label: 'Message box hint', fallback: 'Paste this in Messenger or any chat app', maxLength: 120 },
    ],
    options: MESSENGER_OPTIONS,
    parts: ['button', 'button_alt', 'link', 'divider', 'field'],
  },
  {
    id: 'confirmation.actions',
    page: 'confirmation',
    label: 'Track order button',
    description: 'Track your order, back to menu — or on a kiosk, start a new order.',
    icon: 'MousePointerClick',
    required: true,
    texts: [
      { key: 'track', label: 'Track button', fallback: 'Track Your Order', maxLength: 40 },
      { key: 'back', label: 'Back button', fallback: 'Back to Menu', maxLength: 40 },
      { key: 'countdown', label: 'Tracking countdown', fallback: 'Opening your order tracking in {seconds}...', maxLength: 120, hint: 'Only when the page moves on by itself. {seconds} shows the seconds left.' },
      { key: 'stay', label: 'Stay link', fallback: 'Stay on this page', maxLength: 40 },
      { key: 'kiosk_sent', label: 'Kiosk: sent', fallback: 'Your order has been sent to {store}.', maxLength: 160 },
      { key: 'kiosk_failed', label: 'Kiosk: not sent', fallback: 'This order did not reach {store}. Please tell a staff member.', maxLength: 160 },
      { key: 'kiosk_returning', label: 'Kiosk: countdown', fallback: 'Returning to the menu in {seconds}...', maxLength: 120 },
      { key: 'kiosk_button', label: 'Kiosk: button', fallback: 'Start a New Order', maxLength: 40 },
    ],
    options: ACTIONS_OPTIONS,
    parts: ['button', 'button_alt', 'link'],
  },
  {
    id: 'confirmation.summary',
    page: 'confirmation',
    label: 'Order summary',
    description: 'The dishes, fees and total.',
    icon: 'ReceiptText',
    required: false,
    texts: [
      { key: 'title', label: 'Title', fallback: 'Order Summary', labelKey: 'checkout.summary', maxLength: 60 },
      { key: 'scheduled', label: 'Scheduled for', fallback: 'Scheduled for', maxLength: 40 },
      { key: 'addons', label: 'Add-ons', fallback: 'Add-ons', maxLength: 30 },
      { key: 'note', label: 'Note', fallback: 'Note', maxLength: 30 },
      { key: 'subtotal', label: 'Subtotal', fallback: 'Subtotal', maxLength: 30 },
      { key: 'delivery', label: 'Delivery fee', fallback: 'Delivery Fee', maxLength: 30 },
      { key: 'service', label: 'Service charge', fallback: 'Service Charge', maxLength: 30 },
      { key: 'total', label: 'Total', fallback: 'Total', maxLength: 30 },
    ],
    options: SUMMARY_OPTIONS,
    parts: ['badge', 'price', 'total', 'divider'],
  },
  {
    id: 'confirmation.customer',
    page: 'confirmation',
    label: 'Customer details',
    description: 'What the customer filled in at checkout.',
    icon: 'User',
    required: false,
    texts: [{ key: 'title', label: 'Title', fallback: 'Customer Information', labelKey: 'checkout.customer', maxLength: 60 }],
    options: DETAILS_OPTIONS,
    parts: [],
  },
  {
    id: 'confirmation.payment',
    page: 'confirmation',
    label: 'Payment method',
    description: 'How the customer is paying, with your payment instructions.',
    icon: 'Wallet',
    required: false,
    texts: [{ key: 'title', label: 'Title', fallback: 'Payment Method', labelKey: 'checkout.payment', maxLength: 60 }],
    options: DETAILS_OPTIONS,
    parts: [],
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
