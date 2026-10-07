import { menuItemSchema, menuItemUpdateSchema } from '@/lib/admin-service'

const base = {
  name: 'Coke 1.5L',
  price: 95,
  category_id: '11111111-1111-4111-8111-111111111111',
}

describe('menu item description', () => {
  it('lets a dish be saved with no description, like "Coke 1.5L"', () => {
    expect(menuItemSchema.safeParse({ ...base, description: '' }).success).toBe(true)
  })

  it('still accepts a written description', () => {
    expect(menuItemSchema.safeParse({ ...base, description: 'Ice cold' }).success).toBe(true)
  })

  it('caps the description so a pasted essay cannot flood the menu card', () => {
    expect(menuItemSchema.safeParse({ ...base, description: 'x'.repeat(2001) }).success).toBe(false)
  })

  it('lets a partial update clear the description', () => {
    expect(menuItemUpdateSchema.partial().safeParse({ description: '' }).success).toBe(true)
  })
})
