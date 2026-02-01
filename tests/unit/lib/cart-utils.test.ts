import { describe, test, expect } from '@jest/globals'
import {
  calculateCartItemSubtotal,
  calculateCartTotal,
  getCartItemCount,
  generateCartItemId,
  formatPrice,
  generateMessengerMessage,
  generateMessengerUrl,
  generateMessengerRefUrl,
  generateMessengerCombinedUrl,
  generateMessengerDirectUrl,
} from '@/lib/cart-utils'
import type { CartItem, MenuItem, Variation, VariationOption, Addon } from '@/types/database'
import { createTestMenuItem, createTestVariation, createTestAddon, createTestVariationOption } from '../../fixtures/menu-item.fixture'

describe('cart-utils', () => {
  describe('calculateCartItemSubtotal', () => {
    test('calculates subtotal with base price only', () => {
      const menuItem = createTestMenuItem({ price: 100 })
      const result = calculateCartItemSubtotal(menuItem.price, undefined, [], 2)
      expect(result).toBe(200)
    })

    test('calculates subtotal with legacy variation', () => {
      const menuItem = createTestMenuItem({ price: 100 })
      const variation: Variation = createTestVariation({ name: 'Large', price_modifier: 20 })
      const addons: Addon[] = []
      const result = calculateCartItemSubtotal(menuItem.price, variation, addons, 2)
      expect(result).toBe(240) // (100 + 20) * 2
    })

    test('calculates subtotal with addons', () => {
      const menuItem = createTestMenuItem({ price: 100 })
      const addons: Addon[] = [createTestAddon({ name: 'Cheese', price: 10 })]
      const result = calculateCartItemSubtotal(menuItem.price, undefined, addons, 1)
      expect(result).toBe(110) // (100 + 10) * 1
    })

    test('calculates subtotal with multiple addons', () => {
      const menuItem = createTestMenuItem({ price: 100 })
      const addons: Addon[] = [
        createTestAddon({ name: 'Cheese', price: 10 }),
        createTestAddon({ name: 'Bacon', price: 15 }),
      ]
      const result = calculateCartItemSubtotal(menuItem.price, undefined, addons, 2)
      expect(result).toBe(250) // (100 + 10 + 15) * 2
    })

    test('calculates subtotal with new grouped variations', () => {
      const menuItem = createTestMenuItem({ price: 100 })
      const variations: { [typeId: string]: VariationOption } = {
        'type-1': createTestVariationOption({ id: 'opt-1', name: 'Large', price_modifier: 20 }),
        'type-2': createTestVariationOption({ id: 'opt-2', name: 'Extra', price_modifier: 10 }),
      }
      const result = calculateCartItemSubtotal(menuItem.price, variations, [], 1)
      expect(result).toBe(130) // (100 + 20 + 10) * 1
    })

    test('calculates subtotal with variations and addons combined', () => {
      const menuItem = createTestMenuItem({ price: 100 })
      const variations: { [typeId: string]: VariationOption } = {
        'type-1': createTestVariationOption({ id: 'opt-1', name: 'Large', price_modifier: 20 }),
      }
      const addons: Addon[] = [createTestAddon({ name: 'Cheese', price: 10 })]
      const result = calculateCartItemSubtotal(menuItem.price, variations, addons, 3)
      expect(result).toBe(390) // (100 + 20 + 10) * 3
    })
  })

  describe('calculateCartTotal', () => {
    test('returns 0 for empty cart', () => {
      const items: CartItem[] = []
      expect(calculateCartTotal(items)).toBe(0)
    })

    test('sums up all item subtotals', () => {
      const menuItem = createTestMenuItem({ price: 100 })
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: [],
          quantity: 2,
          subtotal: 200,
        },
        {
          id: 'item-2',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: [],
          quantity: 1,
          subtotal: 100,
        },
      ]
      expect(calculateCartTotal(items)).toBe(300)
    })
  })

  describe('getCartItemCount', () => {
    test('returns 0 for empty cart', () => {
      const items: CartItem[] = []
      expect(getCartItemCount(items)).toBe(0)
    })

    test('sums up all item quantities', () => {
      const menuItem = createTestMenuItem()
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: [],
          quantity: 2,
          subtotal: 200,
        },
        {
          id: 'item-2',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: [],
          quantity: 3,
          subtotal: 300,
        },
      ]
      expect(getCartItemCount(items)).toBe(5)
    })
  })

  describe('generateCartItemId', () => {
    test('generates ID with just menu item id', () => {
      const result = generateCartItemId('menu-item-1')
      expect(result).toBe('menu-item-1')
    })

    test('generates ID with legacy variation', () => {
      const result = generateCartItemId('menu-item-1', 'variation-1')
      expect(result).toBe('menu-item-1_variation-1')
    })

    test('generates ID with addons', () => {
      const result = generateCartItemId('menu-item-1', undefined, ['addon-1', 'addon-2'])
      expect(result).toBe('menu-item-1_addon-1-addon-2')
    })

    test('generates ID with new grouped variations', () => {
      const variations: { [typeId: string]: VariationOption } = {
        'type-2': createTestVariationOption({ id: 'opt-2', name: 'Large', price_modifier: 20 }),
        'type-1': createTestVariationOption({ id: 'opt-1', name: 'Medium', price_modifier: 10 }),
      }
      const result = generateCartItemId('menu-item-1', variations, ['addon-1'])
      // Should sort type IDs and include addon IDs
      expect(result).toBe('menu-item-1_type-1:opt-1_type-2:opt-2_addon-1')
    })

    test('sorts addon IDs', () => {
      const result = generateCartItemId('menu-item-1', undefined, ['addon-3', 'addon-1', 'addon-2'])
      expect(result).toBe('menu-item-1_addon-1-addon-2-addon-3')
    })
  })

  describe('formatPrice', () => {
    test('formats price in PHP currency', () => {
      expect(formatPrice(100)).toBe('₱100.00')
      expect(formatPrice(1234.56)).toBe('₱1,234.56')
      expect(formatPrice(0)).toBe('₱0.00')
      expect(formatPrice(99.99)).toBe('₱99.99')
    })
  })

  describe('generateMessengerMessage', () => {
    test('generates message with basic order details', () => {
      const menuItem = createTestMenuItem({ name: 'Pizza', price: 100 })
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: [],
          quantity: 2,
          subtotal: 200,
        },
      ]
      const result = generateMessengerMessage(items, 'Test Restaurant')
      expect(result).toContain('🍽️ New Order from Test Restaurant')
      expect(result).toContain('1. Pizza x2')
      expect(result).toContain('Price: ₱200.00')
      expect(result).toContain('Total: ₱200.00')
    })

    test('generates message with dine_in order type', () => {
      const menuItem = createTestMenuItem()
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: [],
          quantity: 1,
          subtotal: 100,
        },
      ]
      const result = generateMessengerMessage(items, 'Test', true, { name: 'Dine In', type: 'dine_in' } as const)
      expect(result).toContain('📋 Order Type: 🍽️ Dine In')
    })

    test('generates message with pickup order type', () => {
      const menuItem = createTestMenuItem()
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: [],
          quantity: 1,
          subtotal: 100,
        },
      ]
      const result = generateMessengerMessage(items, 'Test', true, { name: 'Pickup', type: 'pickup' } as const)
      expect(result).toContain('📋 Order Type: 📦 Pickup')
    })

    test('generates message with delivery order type', () => {
      const menuItem = createTestMenuItem()
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: [],
          quantity: 1,
          subtotal: 100,
        },
      ]
      const result = generateMessengerMessage(items, 'Test', true, { name: 'Delivery', type: 'delivery' } as const)
      expect(result).toContain('📋 Order Type: 🚚 Delivery')
    })

    test('generates message with customer information', () => {
      const menuItem = createTestMenuItem()
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: [],
          quantity: 1,
          subtotal: 100,
        },
      ]
      const customerData = {
        customer_name: 'John Doe',
        customer_phone: '1234567890',
        customer_email: 'john@example.com'
      }
      const result = generateMessengerMessage(items, 'Test', true, null, customerData)
      expect(result).toContain('👤 Customer Information:')
      expect(result).toContain('👤 Name: John Doe')
      expect(result).toContain('📞 Phone: 1234567890')
      expect(result).toContain('📧 Email: john@example.com')
    })

    test('generates message with legacy variation', () => {
      const menuItem = createTestMenuItem({ name: 'Pizza' })
      const variation: Variation = createTestVariation({ name: 'Large', price_modifier: 20 })
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variation: variation,
          selected_addons: [],
          quantity: 1,
          subtotal: 120,
        },
      ]
      const result = generateMessengerMessage(items, 'Test')
      expect(result).toContain('1. Pizza (Large) x1')
    })

    test('generates message with new grouped variations', () => {
      const menuItem = createTestMenuItem({ name: 'Pizza' })
      const variations: { [typeId: string]: VariationOption } = {
        'type-1': createTestVariationOption({ name: 'Large' }),
        'type-2': createTestVariationOption({ name: 'Extra Cheese' })
      }
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variations: variations,
          selected_addons: [],
          quantity: 1,
          subtotal: 100,
        },
      ]
      const result = generateMessengerMessage(items, 'Test')
      expect(result).toContain('1. Pizza (Large, Extra Cheese) x1')
    })

    test('generates message with addons', () => {
      const menuItem = createTestMenuItem({ name: 'Pizza' })
      const addons: Addon[] = [
        createTestAddon({ name: 'Extra Cheese', price: 10 }),
        createTestAddon({ name: 'Bacon', price: 15 })
      ]
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: addons,
          quantity: 1,
          subtotal: 125,
        },
      ]
      const result = generateMessengerMessage(items, 'Test')
      expect(result).toContain('Add-ons: Extra Cheese, Bacon')
    })

    test('generates message with special instructions', () => {
      const menuItem = createTestMenuItem()
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: [],
          quantity: 1,
          subtotal: 100,
          special_instructions: 'No onions please',
        },
      ]
      const result = generateMessengerMessage(items, 'Test')
      expect(result).toContain('Special: No onions please')
    })

    test('generates message with payment method', () => {
      const menuItem = createTestMenuItem()
      const items: CartItem[] = [
        {
          id: 'item-1',
          menu_item: menuItem,
          selected_variation: undefined,
          selected_addons: [],
          quantity: 1,
          subtotal: 100,
        },
      ]
      const result = generateMessengerMessage(items, 'Test', true, null, undefined, { name: 'GCash', details: '09123456789' })
      expect(result).toContain('💳 Payment Method:')
      expect(result).toContain('GCash')
      expect(result).toContain('09123456789')
    })
  })

  describe('generateMessengerUrl', () => {
    test('generates URL with pageId and message', () => {
      const result = generateMessengerUrl('123456', 'Test message')
      expect(result).toBe('https://m.me/123456?text=Test%20message')
    })

    test('returns null if pageId is null', () => {
      const result = generateMessengerUrl(null, 'Test message')
      expect(result).toBeNull()
    })

    test('returns null if pageId is empty string', () => {
      const result = generateMessengerUrl('', 'Test message')
      expect(result).toBeNull()
    })

    test('truncates long messages', () => {
      const shortUrl = generateMessengerUrl('123', 'x'.repeat(500))
      const longUrl = generateMessengerUrl('123', 'x'.repeat(2000))
      expect(longUrl).toBeTruthy()
      expect(longUrl!.length).toBeLessThan(2000)
      expect(longUrl).toContain('...')
    })

    test('handles special characters in message', () => {
      const result = generateMessengerUrl('123', 'Hello? How are you!')
      expect(result).toContain('Hello%3F%20How%20are%20you!')
    })
  })

  describe('generateMessengerRefUrl', () => {
    test('generates URL with ref parameter', () => {
      const result = generateMessengerRefUrl('123456', 'order-123')
      const regex = /^https:\/\/m\.me\/123456\?ref=ORDER_order-123_\d+$/
      expect(result).toMatch(regex)
    })

    test('returns null if pageId is null', () => {
      const result = generateMessengerRefUrl(null, 'order-123')
      expect(result).toBeNull()
    })

    test('returns null if orderId is empty', () => {
      const result = generateMessengerRefUrl('123', '')
      expect(result).toBeNull()
    })

    test('includes unique timestamp', () => {
      jest.useFakeTimers()
      const result1 = generateMessengerRefUrl('123', 'order-1')
      // Advance time to ensure different timestamp for the second call
      jest.advanceTimersByTime(1)
      const result2 = generateMessengerRefUrl('123', 'order-1')
      jest.useRealTimers()
      expect(result1).not.toBe(result2)
    })
  })

  describe('generateMessengerCombinedUrl', () => {
    test('generates URL with both ref and text parameters', () => {
      const result = generateMessengerCombinedUrl('123', 'order-123', 'Test message')
      expect(result).toContain('ref=ORDER_order-123_')
      expect(result).toContain('text=Test%20message')
      expect(result).toContain('https://m.me/123?')
    })

    test('returns null for invalid inputs', () => {
      expect(generateMessengerCombinedUrl(null, 'order-1', 'msg')).toBeNull()
      expect(generateMessengerCombinedUrl('123', '', 'msg')).toBeNull()
    })
  })

  describe('generateMessengerDirectUrl', () => {
    test('generates direct messenger.com URL', () => {
      const result = generateMessengerDirectUrl('123456')
      expect(result).toBe('https://www.messenger.com/t/123456')
    })

    test('returns null for empty pageId', () => {
      const result = generateMessengerDirectUrl('')
      expect(result).toBeNull()
    })

    test('trims whitespace from pageId', () => {
      const result = generateMessengerDirectUrl('  123  ')
      expect(result).toBe('https://www.messenger.com/t/123')
    })
  })
})
