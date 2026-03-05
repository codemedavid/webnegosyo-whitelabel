import { describe, test, expect } from '@jest/globals'
import {
  generateMessengerMessage,
  generateMessengerUrl,
  generateMessengerRefUrl,
  generateMessengerCombinedUrl,
  generateMessengerDirectUrl,
} from '@/lib/cart-utils'
import type { CartItem } from '@/types/database'
import { createTestMenuItem, createTestAddon, createTestVariation, createTestVariationOption } from '../../fixtures/menu-item.fixture'

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'item-1',
    menu_item: createTestMenuItem({ name: 'Test Item', price: 100 }),
    selected_addons: [],
    quantity: 1,
    subtotal: 100,
    ...overrides,
  }
}

describe('generateMessengerMessage extended', () => {
  test('generates message without order type', () => {
    const items = [makeCartItem()]
    const result = generateMessengerMessage(items, 'My Restaurant')
    expect(result).toContain('New Order from My Restaurant')
    expect(result).not.toContain('Order Type')
  })

  test('generates message with null order type', () => {
    const items = [makeCartItem()]
    const result = generateMessengerMessage(items, 'Test', null)
    expect(result).not.toContain('Order Type')
  })

  test('generates message with unknown order type uses default emoji', () => {
    const items = [makeCartItem()]
    const result = generateMessengerMessage(items, 'Test', { name: 'Custom', type: 'custom_type' })
    // Unknown type should get the default emoji
    expect(result).toContain('Order Type:')
    expect(result).toContain('Custom')
  })

  test('generates message with formFields for customer data', () => {
    const items = [makeCartItem()]
    const customerData = {
      customer_name: 'Jane',
      custom_field: 'Some value',
    }
    const formFields = [
      { field_name: 'customer_name', field_label: 'Full Name' },
      { field_name: 'custom_field', field_label: 'Special Request' },
    ]
    const result = generateMessengerMessage(items, 'Test', null, customerData, null, formFields)
    expect(result).toContain('Full Name: Jane')
    expect(result).toContain('Special Request: Some value')
  })

  test('skips empty customer data fields', () => {
    const items = [makeCartItem()]
    const customerData = {
      customer_name: 'Jane',
      customer_phone: '',
    }
    const result = generateMessengerMessage(items, 'Test', null, customerData)
    expect(result).toContain('Name: Jane')
    expect(result).not.toContain('Phone')
  })

  test('skips internal fields like delivery_lat', () => {
    const items = [makeCartItem()]
    const customerData = {
      customer_name: 'Jane',
      delivery_lat: '14.5',
      delivery_lng: '121.0',
      messenger_psid: '12345',
    }
    const result = generateMessengerMessage(items, 'Test', null, customerData)
    expect(result).toContain('Name: Jane')
    expect(result).not.toContain('delivery_lat')
    expect(result).not.toContain('delivery_lng')
    expect(result).not.toContain('messenger_psid')
  })

  test('includes special instructions in message', () => {
    const items = [makeCartItem({ special_instructions: 'Extra spicy' })]
    const result = generateMessengerMessage(items, 'Test')
    expect(result).toContain('Special: Extra spicy')
  })

  test('handles multiple items correctly', () => {
    const items = [
      makeCartItem({ id: '1', menu_item: createTestMenuItem({ name: 'Burger' }), subtotal: 150, quantity: 2 }),
      makeCartItem({ id: '2', menu_item: createTestMenuItem({ name: 'Fries' }), subtotal: 50, quantity: 1 }),
    ]
    const result = generateMessengerMessage(items, 'Test')
    expect(result).toContain('1. Burger x2')
    expect(result).toContain('2. Fries x1')
    expect(result).toContain('Total: ₱200.00')
  })

  test('includes payment method without details', () => {
    const items = [makeCartItem()]
    const result = generateMessengerMessage(items, 'Test', null, undefined, { name: 'Cash' })
    expect(result).toContain('Payment Method:')
    expect(result).toContain('Cash')
  })

  test('handles both legacy and grouped variations in same order', () => {
    const items = [
      makeCartItem({
        id: '1',
        menu_item: createTestMenuItem({ name: 'Item A' }),
        selected_variation: createTestVariation({ name: 'Small' }),
      }),
      makeCartItem({
        id: '2',
        menu_item: createTestMenuItem({ name: 'Item B' }),
        selected_variations: {
          'size': createTestVariationOption({ name: 'Medium' }),
          'temp': createTestVariationOption({ name: 'Hot' }),
        },
      }),
    ]
    const result = generateMessengerMessage(items, 'Test')
    expect(result).toContain('Item A (Small)')
    expect(result).toContain('Item B (Medium, Hot)')
  })
})

describe('messenger URL generation extended', () => {
  test('generateMessengerUrl trims pageId whitespace', () => {
    const result = generateMessengerUrl('  123  ', 'hello')
    expect(result).toBe('https://m.me/123?text=hello')
  })

  test('generateMessengerUrl handles undefined pageId', () => {
    expect(generateMessengerUrl(undefined, 'msg')).toBeNull()
  })

  test('generateMessengerRefUrl handles whitespace pageId', () => {
    const result = generateMessengerRefUrl('  456  ', 'order-1')
    expect(result).toContain('https://m.me/456?ref=')
  })

  test('generateMessengerRefUrl handles whitespace orderId', () => {
    const result = generateMessengerRefUrl('123', '  ')
    expect(result).toBeNull()
  })

  test('generateMessengerCombinedUrl truncates very long messages', () => {
    const longMessage = 'x'.repeat(5000)
    const result = generateMessengerCombinedUrl('123', 'order-1', longMessage)
    expect(result).toBeTruthy()
    expect(result).toContain('...')
  })

  test('generateMessengerDirectUrl handles undefined', () => {
    expect(generateMessengerDirectUrl(undefined)).toBeNull()
  })

  test('generateMessengerDirectUrl handles null', () => {
    expect(generateMessengerDirectUrl(null)).toBeNull()
  })
})
