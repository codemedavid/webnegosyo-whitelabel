import { GOOGLE_SCRIPT_URL } from '@/lib/constants'
import type { CartItem } from '@/types/database'

interface PostOrderParams {
  tenantId: string
  tenantName: string
  orderId: string
  orderTypeName: string
  customerData: Record<string, string>
  isCustomerHistoryTracked?: boolean
  previousOrderCount?: number
  totalOrderCount?: number
  total: number
  paymentMethodName: string | null
  paymentMethodDetails: Record<string, unknown> | null
  items: CartItem[]
}

function clean(value: string | undefined): string {
  return (value || '').trim()
}

function pickFieldValue(
  customerData: Record<string, string>,
  exactKeys: string[],
  keyHints: string[]
): string {
  for (const key of exactKeys) {
    const value = clean(customerData[key])
    if (value) return value
  }

  const loweredHints = keyHints.map(h => h.toLowerCase())
  for (const [key, value] of Object.entries(customerData)) {
    const normalizedKey = key.toLowerCase()
    if (!loweredHints.some(hint => normalizedKey.includes(hint))) continue
    const cleaned = clean(value)
    if (cleaned) return cleaned
  }

  return ''
}

export function postOrderToSheets(params: PostOrderParams): void {
  if (!GOOGLE_SCRIPT_URL) return

  const {
    tenantId,
    tenantName,
    orderId,
    orderTypeName,
    customerData,
    isCustomerHistoryTracked = true,
    previousOrderCount = 0,
    totalOrderCount = previousOrderCount + 1,
    total,
    paymentMethodName,
    paymentMethodDetails,
    items,
  } = params

  const safePreviousOrderCount = isCustomerHistoryTracked ? Math.max(0, previousOrderCount) : 0
  const safeTotalOrderCount = isCustomerHistoryTracked
    ? Math.max(safePreviousOrderCount + 1, totalOrderCount)
    : 0
  const isReturningCustomer = isCustomerHistoryTracked && safePreviousOrderCount > 0

  const customerName = pickFieldValue(customerData, ['customer_name', 'name', 'full_name'], ['name'])
  const customerPhone = pickFieldValue(
    customerData,
    ['customer_phone', 'phone', 'mobile', 'contact_number', 'contact'],
    ['phone', 'mobile', 'contact']
  )
  const customerEmail = pickFieldValue(customerData, ['customer_email', 'email'], ['email'])
  const customerAddress = pickFieldValue(
    customerData,
    ['customer_address', 'address', 'delivery_address'],
    ['address', 'location']
  )
  const customerTableNumber = pickFieldValue(
    customerData,
    ['table_number', 'customer_table_number', 'table'],
    ['table']
  )
  const customerNotes = pickFieldValue(
    customerData,
    ['notes', 'special_instructions', 'customer_notes'],
    ['note', 'instruction', 'remark']
  )

  const customer = {
    name: customerName,
    phone: customerPhone,
    email: customerEmail,
    address: customerAddress,
    tableNumber: customerTableNumber,
    notes: customerNotes,
    previousOrderCount: safePreviousOrderCount,
    totalOrderCount: safeTotalOrderCount,
    isReturningCustomer,
    historyTracked: isCustomerHistoryTracked,
    discount: 0,
  }

  const mappedItems = items.map(item => ({
    productId: item.menu_item.id,
    name: item.menu_item.name,
    category: item.menu_item.category_id || '',
    quantity: item.quantity,
    price: item.menu_item.discounted_price ?? item.menu_item.price,
    isUpsell: false,
    upsellFrom: '',
    specialInstructions: item.special_instructions || '',
  }))

  // Send the standard payload — the GAS script handles all formatting
  const payload = {
    orderId,
    tenantId,
    tenantName,
    orderTypeName,
    total,
    paymentMethodName: paymentMethodName || 'N/A',
    paymentMethodDetails: paymentMethodDetails || {},
    customerData: customer,
    customerHistory: {
      previousOrderCount: safePreviousOrderCount,
      totalOrderCount: safeTotalOrderCount,
      isReturningCustomer,
      historyTracked: isCustomerHistoryTracked,
    },
    items: mappedItems,
  }

  const body = JSON.stringify(payload)

  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
    redirect: 'follow',
  })
    .then(res => {
      console.log('Google Sheets sync response:', res?.status)
    })
    .catch(err => {
      console.warn('Google Sheets order sync failed:', err)
    })
}
