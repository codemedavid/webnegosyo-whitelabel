/**
 * @jest-environment node
 *
 * Boost Sales' cart "last call" is an `analytics` screen, but analytics-only
 * staff may no longer write `tenants` directly (20261106130000). So the
 * permission is checked in code and the write goes out on the service role,
 * carrying only the validated checkout_upsell_* fields.
 */
const mockVerify = jest.fn()
const mockSessionClient = jest.fn()
const updates: Array<{ client: string; payload: Record<string, unknown>; id: string }> = []

function fakeClient(name: string) {
  return {
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (_column: string, id: string) => ({
          select: () => ({
            single: async () => {
              updates.push({ client: name, payload, id })
              return { data: { id, ...payload }, error: null }
            },
          }),
        }),
      }),
    }),
  }
}

jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: (...args: unknown[]) => mockVerify(...args) }))
jest.mock('@/lib/supabase/server', () => ({ createClient: (...args: unknown[]) => mockSessionClient(...args) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient('service') }))

const INPUT = {
  checkout_upsell_enabled: true,
  checkout_upsell_title: 'One more thing',
  checkout_upsell_subtitle: 'Add a side',
  checkout_upsell_max_items: 3,
}

describe('updateCheckoutUpsellSettings', () => {
  beforeEach(() => {
    updates.length = 0
    mockVerify.mockReset().mockResolvedValue({ user: { id: 'u1' } })
    mockSessionClient.mockReset().mockResolvedValue(fakeClient('session'))
  })

  it('checks analytics, then writes with the service role', async () => {
    const { updateCheckoutUpsellSettings } = await import('@/lib/menu-engineering-service')

    await updateCheckoutUpsellSettings('tenant-1', INPUT)

    expect(mockVerify).toHaveBeenCalledWith('tenant-1', 'analytics')
    expect(updates).toEqual([{ client: 'service', payload: INPUT, id: 'tenant-1' }])
  })

  it('writes nothing when the permission check refuses', async () => {
    const { updateCheckoutUpsellSettings } = await import('@/lib/menu-engineering-service')
    mockVerify.mockRejectedValue(new Error('Forbidden'))

    await expect(updateCheckoutUpsellSettings('tenant-1', INPUT)).rejects.toThrow('Forbidden')
    expect(updates).toEqual([])
  })

  it('drops any field outside the checkout_upsell_* schema', async () => {
    const { updateCheckoutUpsellSettings } = await import('@/lib/menu-engineering-service')

    await updateCheckoutUpsellSettings('tenant-1', { ...INPUT, is_active: false, slug: 'x' } as never)

    expect(updates[0].payload).toEqual(INPUT)
  })

  it('keeps the provisioning path on the client it was given, unchecked', async () => {
    const { updateCheckoutUpsellSettings } = await import('@/lib/menu-engineering-service')

    await updateCheckoutUpsellSettings('tenant-1', INPUT, { client: fakeClient('provisioning') } as never)

    expect(mockVerify).not.toHaveBeenCalled()
    expect(updates[0].client).toBe('provisioning')
  })
})
