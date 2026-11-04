// A SAMPLE checkout for the Page Designer canvas: two cart lines, three
// questions, two payment methods, pickup + delivery and advance orders on —
// enough for every block to show itself. Every handler is inert and nothing
// here reaches the network (no address field, loyalty off, no QR images).

import { getTenantBranding, type BrandingColors } from '@/lib/branding-utils'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

/** The checkout palette the canvas paints with (its `--co-*` values). */
export interface SamplePalette {
  bg: string
  card: string
  summary: string
  text: string
  muted: string
  border: string
  accent: string
  accentText: string
  button: string
  success: string
  warning: string
  error: string
}

const noop = (): void => undefined
const asyncNoop = async (): Promise<void> => undefined

const SUBTOTAL = 485
const PICKUP_ID = 'sample-pickup'

const ITEMS = [
  {
    id: 'sample-line-1',
    menu_item: { id: 'sample-item-1', name: 'Chicken Adobo Rice Bowl' },
    quantity: 2,
    subtotal: 330,
    selected_variation: null,
    selected_variations: {},
    selected_addons: [],
    special_instructions: '',
  },
  {
    id: 'sample-line-2',
    menu_item: { id: 'sample-item-2', name: 'Iced Calamansi Juice' },
    quantity: 1,
    subtotal: 155,
    selected_variation: { id: 'sample-var', name: 'Large' },
    selected_variations: {},
    selected_addons: [],
    special_instructions: 'Less ice',
  },
]

const FORM_FIELDS = [
  { id: 'sample-f-name', field_name: 'customer_name', field_label: 'Name', field_type: 'text', is_required: true, placeholder: 'Your name', options: null },
  { id: 'sample-f-phone', field_name: 'customer_phone', field_label: 'Phone', field_type: 'phone', is_required: true, placeholder: '0917 123 4567', options: null },
  { id: 'sample-f-notes', field_name: 'notes', field_label: 'Notes for the kitchen', field_type: 'textarea', is_required: false, placeholder: 'Anything we should know?', options: null },
]

const PAYMENT_METHODS = [
  {
    id: 'sample-gcash',
    name: 'GCash',
    details: 'Account name: Your Store\nNumber: 0917 123 4567',
    qr_code_url: null,
    require_payment_proof: true,
  },
  { id: 'sample-cash', name: 'Cash', details: null, qr_code_url: null, require_payment_proof: false, skip_payment_details: true },
]

const ORDER_TYPES = [
  { id: PICKUP_ID, name: 'Pickup', type: 'pickup', description: 'Pick it up at the counter', advance_order_enabled: true },
  { id: 'sample-delivery', name: 'Delivery', type: 'delivery', description: 'We bring it to you', advance_order_enabled: false },
]

/** Tenant + branding that make getCheckoutPalette reproduce `palette` exactly. */
function sampleColours(palette: SamplePalette | null): { tenant: Record<string, unknown>; branding: BrandingColors } {
  const base = { id: 'sample-tenant', name: 'Your store', slug: 'sample', lalamove_market: 'PH', loyalty_enabled: false }
  const branding = getTenantBranding(null)
  if (!palette) return { tenant: base, branding }
  return {
    tenant: {
      ...base,
      checkout_background_color: palette.bg,
      checkout_card_background_color: palette.card,
      checkout_summary_background_color: palette.summary,
      checkout_text_color: palette.text,
      checkout_muted_text_color: palette.muted,
      checkout_border_color: palette.border,
      checkout_button_color: palette.button,
      checkout_button_text_color: palette.accentText,
    },
    branding: { ...branding, checkoutAccent: palette.accent, success: palette.success, warning: palette.warning, error: palette.error },
  }
}

/** The sample checkout, painted with the canvas palette when it is known. */
export function buildSampleCheckout(palette: SamplePalette | null, storeName = 'Your store'): UseCheckoutReturn {
  const { tenant, branding } = sampleColours(palette)
  const sample = {
    tenantSlug: 'sample',
    router: { push: noop, back: noop, replace: noop, refresh: noop, prefetch: noop, forward: noop },
    branding,
    openStatus: { isOrderingBlocked: false, reason: null, nextOpenLabel: null },
    tenant: { ...tenant, name: storeName },
    isLoading: false,
    isProcessing: false,
    orderTypes: ORDER_TYPES,
    orderType: PICKUP_ID,
    setOrderType: noop,
    shouldAskFulfillment: true,
    selectedOrderTypeData: ORDER_TYPES[0],
    messengerEnabled: false,
    isKiosk: false,
    outlet: { selectedOutletId: null, choices: [], isMissingRequiredSelection: false },
    formFields: FORM_FIELDS,
    customerData: { customer_name: 'Maria Santos', customer_phone: '+639171234567' },
    setCustomerData: noop,
    isSmsOptedIn: false,
    setIsSmsOptedIn: noop,
    paymentMethods: PAYMENT_METHODS,
    selectedPaymentMethod: 'sample-gcash',
    setSelectedPaymentMethod: noop,
    items: ITEMS,
    bundleItems: [],
    total: SUBTOTAL,
    serviceChargeAmount: 0,
    deliveryFee: null,
    isDeliveryFeeWaived: false,
    freeDeliveryThreshold: null,
    freeDeliveryRemaining: null,
    isFetchingDeliveryFee: false,
    deliveryFeeAddress: null,
    deliveryOutOfRange: false,
    deliveryDistanceKm: null,
    deliveryFeeError: null,
    retryDeliveryQuote: noop,
    validDeliveryFee: 0,
    grandTotal: SUBTOTAL,
    orderMinimum: { meets: true, minimum: 0, shortfall: 0 },
    voucherCodes: [],
    voucherPreview: null,
    isCheckingVoucher: false,
    applyVoucherCode: asyncNoop,
    removeVoucherCode: asyncNoop,
    voucherLineNames: {},
    setVoucherUnitPicks: asyncNoop,
    govSetup: {
      onlineClaims: false,
      kinds: [{ kind: 'senior', label: 'Senior Citizen', idLabel: 'OSCA ID number', idPlaceholder: 'e.g. 12345' }],
    },
    govClaim: null,
    govPreview: null,
    isCheckingGov: false,
    applyGovClaim: asyncNoop,
    removeGovClaim: noop,
    govLines: null,
    advanceConfig: { enabled: true, allowAsap: true, leadTimeMinutes: 0 },
    scheduleMode: 'asap',
    setScheduleMode: noop,
    scheduleDate: '',
    setScheduleDate: noop,
    scheduleTime: '',
    setScheduleTime: noop,
    scheduleDates: [],
    timeSlots: [],
    isScheduling: false,
    scheduledForLabel: null,
    isScheduleValid: true,
    handleScheduleDateChange: noop,
    cartPresellDate: null,
    openQrDialog: noop,
    copiedText: null,
    handleCopyText: noop,
    handleProceedToPayment: noop,
  }
  // A look-alike of the hook's value: only the fields the checkout blocks read.
  return sample as unknown as UseCheckoutReturn
}
