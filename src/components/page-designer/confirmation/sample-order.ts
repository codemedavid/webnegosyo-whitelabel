// A sample order for the Page Designer's thank-you editor. Pure, no network:
// every value is made up and nothing here is ever sent anywhere.

import { getTenantBranding } from '@/lib/branding-utils'
import type { CompletedOrderData } from '@/lib/checkout/completed-order'
import type { OrderSaveNotice } from '@/lib/checkout/order-save-outcome'
import type { CartItem } from '@/types/database'

import type { ConfirmationBlocksValue } from './confirmation-context'
import { confirmationGrandTotal } from './confirmation-runtime'

const SAMPLE_ITEMS = [
  {
    id: 'sample-1',
    menu_item: { id: 'sample-m1', name: 'Chicken Adobo Rice Bowl', price: 185 },
    selected_variation: { id: 'sample-v1', name: 'Large', price_modifier: 30 },
    selected_addons: [{ id: 'sample-a1', name: 'Fried Egg', price: 20, quantity: 1 }],
    quantity: 1,
    subtotal: 235,
  },
  {
    id: 'sample-2',
    menu_item: { id: 'sample-m2', name: 'Iced Spanish Latte', price: 125 },
    selected_addons: [],
    quantity: 2,
    subtotal: 250,
    special_instructions: 'Less ice, please',
  },
] as unknown as CartItem[]

export const SAMPLE_COMPLETED_ORDER: CompletedOrderData = {
  items: SAMPLE_ITEMS,
  total: 485,
  deliveryFee: null,
  serviceChargeAmount: 0,
  discounts: [],
  customerData: { customer_name: 'Maria Santos', customer_phone: '0917 123 4567' },
  orderTypeName: 'Pickup',
  scheduledForLabel: null,
  paymentMethodName: 'GCash',
  paymentMethodDetails: 'Send to 0917 000 0000 and show the receipt at pickup.',
  messengerMessage: 'New order\n1x Chicken Adobo Rice Bowl (Large)\n2x Iced Spanish Latte\nTotal: ₱485.00',
  messengerUrl: 'https://m.me/your.page',
  formFields: [
    { field_name: 'customer_name', field_label: 'Name' },
    { field_name: 'customer_phone', field_label: 'Phone' },
  ],
}

const SAMPLE_FAILED_NOTICE: OrderSaveNotice = {
  verdict: 'failed',
  message: 'We could not confirm your order with the store.',
  isMessengerRecoverable: true,
}

const inert = (): void => undefined

/**
 * The editor's context value: the sample order, every button inert. `store`
 * (the editor's store row, Look edits included) lets a block with its own
 * colours preview them over the store's.
 */
export function sampleConfirmationValue(
  storeName: string,
  isFailed: boolean,
  store?: Readonly<Record<string, unknown>>,
): ConfirmationBlocksValue {
  const row = store ? { ...store } : null
  return {
    storeName: storeName || 'Your store',
    order: SAMPLE_COMPLETED_ORDER,
    grandTotal: confirmationGrandTotal(SAMPLE_COMPLETED_ORDER),
    isMessengerEnabled: true,
    messengerCountdown: 0,
    isMessageExpanded: false,
    onToggleMessage: inert,
    onOpenMessenger: inert,
    onCopyMessage: inert,
    isKiosk: false,
    kioskCountdown: null,
    onStartNewOrder: inert,
    saveNotice: isFailed ? SAMPLE_FAILED_NOTICE : null,
    hasOrderSaveFailed: isFailed,
    hasMessengerFallback: true,
    canTrack: !isFailed,
    onTrack: inert,
    onBackToMenu: inert,
    trackingCountdown: null,
    onStayHere: null,
    ...(row ? { themeSource: { tenant: row, branding: getTenantBranding(row) } } : {}),
  }
}
