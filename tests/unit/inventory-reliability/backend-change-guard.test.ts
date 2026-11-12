import { describe, test, expect, jest } from '@jest/globals'
import { previewBackendChange } from '@/lib/order-backend'
import { refuseUnconfirmedBackendChange } from '@/lib/order-backend-change-guard'

const NO_URL = { order_backend: 'auto' as const, convex_deployment_url: null }
const WITH_URL = { order_backend: 'auto' as const, convex_deployment_url: 'https://x.convex.cloud' }

describe('previewBackendChange', () => {
  test('an unrelated re-save changes nothing', () => {
    expect(previewBackendChange(NO_URL, { order_backend: 'auto' })).toBeNull()
    expect(previewBackendChange(WITH_URL, { order_backend: 'auto', convex_deployment_url: 'https://x.convex.cloud' })).toBeNull()
  })
  test('omitting the url keeps the stored one (the form saves undefined as unchanged)', () => {
    expect(previewBackendChange(WITH_URL, { order_backend: 'auto' })).toBeNull()
  })
  test('pinning platform while a convex url exists is a move off convex', () => {
    expect(previewBackendChange(WITH_URL, { order_backend: 'platform' })).toEqual({ from: 'convex', to: 'platform' })
  })
  test('adding a convex url on auto moves platform to convex', () => {
    expect(previewBackendChange(NO_URL, { order_backend: 'auto', convex_deployment_url: 'https://x.convex.cloud' }))
      .toEqual({ from: 'platform', to: 'convex' })
  })
  test("a stale 'supabase' pin (the retired own-project backend) already routes like auto, so a save moves nothing", () => {
    const stale = { order_backend: 'supabase' as never, convex_deployment_url: null }
    expect(previewBackendChange(stale, { order_backend: 'platform' })).toBeNull()
    expect(previewBackendChange(stale, { order_backend: 'auto' })).toBeNull()
  })
})

function fakeClient(rows: { orders: number; claims: number } | 'error') {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          limit: async () => {
            if (rows === 'error') return { data: null, error: { message: 'boom' } }
            const count = table === 'orders' ? rows.orders : rows.claims
            return { data: Array.from({ length: count }, () => ({ id: 'x' })), error: null }
          },
        }),
      }),
    }),
  } as never
}

describe('refuseUnconfirmedBackendChange', () => {
  const base = { tenantId: 't1', current: WITH_URL, input: { order_backend: 'platform' as const } }

  test('passes when the resolved backend does not change', async () => {
    const result = await refuseUnconfirmedBackendChange({ ...base, input: { order_backend: 'auto' }, supabase: fakeClient({ orders: 5, claims: 5 }), confirmed: false })
    expect(result).toBeNull()
  })
  test('refuses leaving convex without confirmation (its orders cannot be counted here)', async () => {
    const result = await refuseUnconfirmedBackendChange({ ...base, supabase: fakeClient({ orders: 0, claims: 0 }), confirmed: false })
    expect(result).toMatch(/existing orders/i)
  })
  test('refuses leaving platform when the store has platform orders', async () => {
    const result = await refuseUnconfirmedBackendChange({
      tenantId: 't1', current: NO_URL,
      input: { order_backend: 'auto', convex_deployment_url: 'https://x.convex.cloud' },
      supabase: fakeClient({ orders: 1, claims: 0 }), confirmed: false,
    })
    expect(result).toMatch(/confirm_backend_change/)
  })
  test('refuses leaving platform when only stock claims exist', async () => {
    const result = await refuseUnconfirmedBackendChange({
      tenantId: 't1', current: NO_URL,
      input: { order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' },
      supabase: fakeClient({ orders: 0, claims: 2 }), confirmed: false,
    })
    expect(result).not.toBeNull()
  })
  test('lets a store with no orders and no claims move', async () => {
    const result = await refuseUnconfirmedBackendChange({
      tenantId: 't1', current: NO_URL,
      input: { order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' },
      supabase: fakeClient({ orders: 0, claims: 0 }), confirmed: false,
    })
    expect(result).toBeNull()
  })
  test('an explicit confirmation lets it through', async () => {
    expect(await refuseUnconfirmedBackendChange({ ...base, supabase: fakeClient({ orders: 9, claims: 9 }), confirmed: true })).toBeNull()
  })
  test('a failed check fails closed', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = await refuseUnconfirmedBackendChange({
      tenantId: 't1', current: NO_URL,
      input: { order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' },
      supabase: fakeClient('error'), confirmed: false,
    })
    expect(result).not.toBeNull()
  })
})
