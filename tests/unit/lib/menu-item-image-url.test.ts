import { describe, test, expect, jest } from '@jest/globals'

// admin-service.ts imports the server-side Supabase client (next/headers),
// which can't run under jsdom. We only need the pure Zod schema, so stub it.
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

import { menuItemSchema } from '@/lib/admin-service'

const baseItem = {
  name: 'Delicious Burger',
  description: 'A delicious handmade burger with fresh ingredients',
  price: 100,
  category_id: '11111111-1111-4111-8111-111111111111',
}

describe('menuItemSchema image_url validation', () => {
  test('accepts a valid ImageKit delivery URL', () => {
    const result = menuItemSchema.safeParse({
      ...baseItem,
      image_url: 'https://ik.imagekit.io/tenant/tenants/burger_abc.png',
    })
    expect(result.success).toBe(true)
  })

  test('allows an empty image_url (product without an image)', () => {
    const result = menuItemSchema.safeParse({
      ...baseItem,
      image_url: '',
    })
    expect(result.success).toBe(true)
  })

  test('allows a missing image_url', () => {
    const result = menuItemSchema.safeParse(baseItem)
    expect(result.success).toBe(true)
  })

  test('rejects a non-empty string that is not a URL', () => {
    const result = menuItemSchema.safeParse({
      ...baseItem,
      image_url: 'not-a-url',
    })
    expect(result.success).toBe(false)
  })
})
