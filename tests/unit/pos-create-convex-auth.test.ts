/** @jest-environment node */
jest.mock('../../convex-template/convex/_generated/server', () => ({
  mutation: (config: unknown) => config, internalMutation: (config: unknown) => config,
  query: (config: unknown) => config, internalQuery: (config: unknown) => config,
}))
import { createOrder, createOrderInternal } from '../../convex-template/convex/orders'

const handler = (createOrder as unknown as { handler: (ctx: unknown, args: Record<string, unknown>) => Promise<string> }).handler
const config: Record<string, string> = { tenant_id: 't1', auth_enforced: 'true', public_reads: 'false' }
function context(identity: Record<string, string> | null) {
  return {
    auth: { getUserIdentity: async () => identity },
    db: { query: (table: string) => ({ withIndex: (_name: string, build: (q: { eq: (field: string, value: string) => void }) => void) => {
      let key = ''
      build({ eq: (_field, value) => { key = value } })
      return { first: async () => table === 'tenantConfig' ? { value: config[key] } : { _id: 'existing-order' } }
    } }) },
  }
}
const args = { source: 'pos', clientOrderId: 'known-key', items: [] }

it('checks POS merchant access before returning an idempotent order', async () => {
  await expect(handler(context(null), args)).rejects.toThrow('Unauthorized')
  await expect(handler(context({ subject: 'u2', wn_tenant_id: 't2', wn_role: 'admin' }), args)).rejects.toThrow('Unauthorized')
  await expect(handler(context({ subject: 'u1', wn_tenant_id: 't1', wn_role: 'admin' }), args)).resolves.toBe('existing-order')
})

it('preserves the public customer order path', async () => {
  await expect(handler(context(null), { ...args, source: 'web' })).resolves.toBe('existing-order')
})

it('requires strict merchant authentication for public Lalamove-store order writes even during soft auth rollout', async () => {
  config.lalamove_api_key = 'configured-key'
  config.auth_enforced = 'false'
  try {
    for (const source of ['web', 'mobile', 'qr_handoff', 'pos']) {
      await expect(handler(context(null), { ...args, source, orderType: 'Custom delivery' }))
        .rejects.toThrow(/website|Unauthorized/i)
    }
    await expect(handler(context({ subject: 'u1', wn_tenant_id: 't1', wn_role: 'customer' }), args))
      .rejects.toThrow(/Unauthorized/i)
    await expect(handler(context({ subject: 'u1', wn_tenant_id: 't1', wn_role: 'admin' }), args))
      .resolves.toBe('existing-order')
  } finally {
    delete config.lalamove_api_key
    config.auth_enforced = 'true'
  }
})

it('lets the trusted server write validated customer orders through its internal mutation', async () => {
  config.lalamove_enabled = 'true'
  try {
    const internalHandler = (createOrderInternal as unknown as { handler: typeof handler }).handler
    await expect(internalHandler(context(null), { ...args, source: 'web' }))
      .resolves.toBe('existing-order')
  } finally {
    delete config.lalamove_enabled
  }
})
