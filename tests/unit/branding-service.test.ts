import { describe, it, expect, jest } from '@jest/globals'
import {
  buildBrandingUpdatePayload,
  writeBrandingWithClient,
  brandingSchema,
  type BrandingInput,
  type BrandingPatchInput,
} from '@/lib/branding-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'

const TENANT = '11111111-1111-4111-8111-111111111111'

/** Builds a complete, valid BrandingInput (only the two required colors). */
function brandingInput(overrides: Partial<BrandingInput> = {}): BrandingInput {
  return brandingSchema.parse({
    primary_color: '#ff0000',
    secondary_color: '#00ff00',
    ...overrides,
  })
}

/** Fake service-role client capturing the tenants update chain. */
function makeUpdateStub(error: unknown = null) {
  const single = jest.fn(async () => ({ data: { id: TENANT }, error }))
  const select = jest.fn((_cols: string) => ({ single }))
  const eq = jest.fn((_col: string, _val: unknown) => ({ select }))
  const update = jest.fn((_payload: unknown) => ({ eq }))
  const from = jest.fn((_table: string) => ({ update }))
  const client = { from } as unknown as ProvisioningCtx['client']
  return { client, from, update, eq }
}

describe('buildBrandingUpdatePayload', () => {
  it("normalizes an empty promotion_banners string to an empty array", () => {
    const payload = buildBrandingUpdatePayload(brandingInput({ promotion_banners: '' }))
    expect(payload.promotion_banners).toEqual([])
  })

  it('passes a populated promotion_banners array through unchanged', () => {
    const banners = [{ id: 'b1', imageUrl: 'https://x/y.png', title: 'Sale' }]
    const payload = buildBrandingUpdatePayload(brandingInput({ promotion_banners: banners }))
    expect(payload.promotion_banners).toEqual(banners)
  })

  it('converts empty hero uuid/url fields to null so "unset" persists as NULL', () => {
    const payload = buildBrandingUpdatePayload(
      brandingInput({ hero_featured_product_id: '', hero_image_url: '', hero_link_url: '' }),
    )
    expect(payload.hero_featured_product_id).toBeNull()
    expect(payload.hero_image_url).toBeNull()
    expect(payload.hero_link_url).toBeNull()
  })

  it('preserves the core color fields', () => {
    const payload = buildBrandingUpdatePayload(brandingInput({ primary_color: '#123456' }))
    expect(payload.primary_color).toBe('#123456')
    expect(payload.secondary_color).toBe('#00ff00')
  })
})

describe('writeBrandingWithClient', () => {
  it('accepts a header-color-only patch without requiring unrelated core colors', async () => {
    const { client, update } = makeUpdateStub()

    const result = await writeBrandingWithClient(client, TENANT, {
      header_color: '#8B1A1A',
    } as BrandingPatchInput)

    expect(result.success).toBe(true)
    expect(update).toHaveBeenCalledWith({
      header_color: '#8B1A1A',
    })
  })

  it('updates the tenants row via the injected client and reports success', async () => {
    const { client, from, update, eq } = makeUpdateStub()
    const result = await writeBrandingWithClient(client, TENANT, brandingInput())
    expect(result.success).toBe(true)
    expect(from).toHaveBeenCalledWith('tenants')
    expect(eq).toHaveBeenCalledWith('id', TENANT)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('validates input and rejects a CSS-injection color', async () => {
    const { client } = makeUpdateStub()
    const result = await writeBrandingWithClient(client, TENANT, {
      primary_color: '#fff',
      secondary_color: 'red;}<script>',
    } as unknown as BrandingInput)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/validation/i)
  })

  it('retries with rollout fields omitted when a column is missing', async () => {
    const single = jest
      .fn<() => Promise<{ data: unknown; error: unknown }>>()
      .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column "cart_template" does not exist' } })
      .mockResolvedValueOnce({ data: { id: TENANT }, error: null })
    const select = jest.fn((_cols: string) => ({ single }))
    const eq = jest.fn((_col: string, _val: unknown) => ({ select }))
    const update = jest.fn((_payload: unknown) => ({ eq }))
    const client = { from: jest.fn((_t: string) => ({ update })) } as unknown as ProvisioningCtx['client']

    const result = await writeBrandingWithClient(client, TENANT, brandingInput({ cart_template: 'modern' }))
    expect(result.success).toBe(true)
    expect(result.skippedFields).toContain('cart_template')
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('drops mobile_overrides on the retry so an unmigrated database still saves branding', async () => {
    // mobile_overrides ships with a migration. Before it is applied the first
    // update fails with "column does not exist"; if the retry keeps sending the
    // column the whole publish fails and the merchant loses every edit.
    const single = jest
      .fn<() => Promise<{ data: unknown; error: unknown }>>()
      .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column "mobile_overrides" does not exist' } })
      .mockResolvedValueOnce({ data: { id: TENANT }, error: null })
    const select = jest.fn((_cols: string) => ({ single }))
    const eq = jest.fn((_col: string, _val: unknown) => ({ select }))
    const update = jest.fn((_payload: unknown) => ({ eq }))
    const client = { from: jest.fn((_t: string) => ({ update })) } as unknown as ProvisioningCtx['client']

    const result = await writeBrandingWithClient(
      client,
      TENANT,
      brandingInput({ mobile_overrides: { page_layout: 'sidebar' } }),
    )

    expect(result.success).toBe(true)
    expect(result.skippedFields).toContain('mobile_overrides')
    const retryPayload = update.mock.calls[1][0] as Record<string, unknown>
    expect(retryPayload).not.toHaveProperty('mobile_overrides')
  })

  it('surfaces a non-column database error as a failure', async () => {
    const { client } = makeUpdateStub({ code: '23505', message: 'unique violation' })
    const result = await writeBrandingWithClient(client, TENANT, brandingInput())
    expect(result.success).toBe(false)
    expect(result.error).toBe('unique violation')
  })
})
