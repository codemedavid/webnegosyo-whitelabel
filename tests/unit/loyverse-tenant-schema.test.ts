import { tenantSchema } from '@/lib/tenants-service'

const baseTenant = {
  name: 'Cafe X',
  slug: 'cafe-x',
  primary_color: '#000000',
  secondary_color: '#ffffff',
  messenger_page_id: '123456',
}

describe('tenantSchema — Loyverse fields', () => {
  it('parses with Loyverse absent, defaulting to disabled + on_confirm', () => {
    const parsed = tenantSchema.parse(baseTenant)
    expect(parsed.loyverse_enabled).toBe(false)
    expect(parsed.loyverse_push_mode).toBe('on_confirm')
  })

  it('rejects enabling Loyverse without an access token and store', () => {
    expect(() =>
      tenantSchema.parse({ ...baseTenant, loyverse_enabled: true })
    ).toThrow(/loyverse/i)
  })

  it('accepts a fully configured Loyverse tenant', () => {
    const parsed = tenantSchema.parse({
      ...baseTenant,
      loyverse_enabled: true,
      loyverse_access_token: 'tok_1',
      loyverse_store_id: 'store_1',
      loyverse_push_mode: 'on_create',
    })
    expect(parsed.loyverse_push_mode).toBe('on_create')
  })

  it('rejects unknown push modes instead of coercing at the write boundary', () => {
    expect(() =>
      tenantSchema.parse({
        ...baseTenant,
        loyverse_enabled: false,
        loyverse_push_mode: 'immediately',
      })
    ).toThrow()
  })

  it('keeps credentials while the integration is toggled off', () => {
    const parsed = tenantSchema.parse({
      ...baseTenant,
      loyverse_enabled: false,
      loyverse_access_token: 'tok_1',
      loyverse_store_id: 'store_1',
    })
    expect(parsed.loyverse_access_token).toBe('tok_1')
  })
})
