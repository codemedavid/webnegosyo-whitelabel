/** @jest-environment node */
jest.mock('../../convex-template/convex/_generated/server', () => ({
  mutation: (config: unknown) => config, internalMutation: (config: unknown) => config,
  query: (config: unknown) => config, internalQuery: (config: unknown) => config,
}))
import { createOrder } from '../../convex-template/convex/orders'

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
