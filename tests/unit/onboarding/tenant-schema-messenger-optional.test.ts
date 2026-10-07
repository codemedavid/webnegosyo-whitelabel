/**
 * A store built by the funnel onboarding has no Facebook page yet: the owner
 * connects it later from Settings. Checkout already copes with no page (the
 * Messenger hand-off resolves to no link), so creating the store must not
 * require one.
 */
import { tenantSchema } from '@/lib/tenants-service'

const baseTenant = {
  name: 'Cafe X',
  slug: 'cafe-x',
  primary_color: '#000000',
  secondary_color: '#ffffff',
}

describe('tenantSchema — Messenger page id', () => {
  test('accepts a store with no Messenger page id', () => {
    // Act
    const result = tenantSchema.safeParse(baseTenant)

    // Assert
    expect(result.success).toBe(true)
    expect(result.success && result.data.messenger_page_id).toBeUndefined()
  })

  test('keeps a typed page id', () => {
    // Act
    const result = tenantSchema.safeParse({ ...baseTenant, messenger_page_id: '123456' })

    // Assert
    expect(result.success && result.data.messenger_page_id).toBe('123456')
  })

  test('accepts an explicitly blank page id (the form clearing it)', () => {
    // Act
    const result = tenantSchema.safeParse({ ...baseTenant, messenger_page_id: '' })

    // Assert
    expect(result.success && result.data.messenger_page_id).toBe('')
  })
})
