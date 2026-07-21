import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock the cookie-based server client so we can assert it is NOT used on the
// injected-context (MCP) path.
const cookieCreateClient = jest.fn(async () => {
  throw new Error('cookie createClient should not be called on the MCP path')
})
jest.mock('@/lib/supabase/server', () => ({
  createClient: cookieCreateClient,
}))

// verifyTenantAdmin reads cookies; on the MCP path it must never run. Make it
// throw so a stray call fails loudly.
jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: jest.fn(async () => {
    throw new Error('verifyTenantAdmin should not be called on the MCP path')
  }),
}))

import { updateTenantSupabase } from '@/lib/tenants-service'
import { createPaymentMethod } from '@/lib/payment-methods-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'

const TENANT = '11111111-1111-4111-8111-111111111111'

/**
 * A chainable Supabase-query stub. Every builder method returns the same
 * builder so any `.from(...).select(...).eq(...)...` chain works. Terminal
 * `maybeSingle`/`single` resolve from queued results; awaiting the builder
 * directly (as isSlugTaken does) resolves to an empty list.
 */
function makeChainableClient() {
  const terminalQueue: Array<{ data: unknown; error: unknown }> = []
  const updatePayloads: unknown[] = []
  const insertPayloads: unknown[] = []
  const tables: string[] = []

  const next = () => terminalQueue.shift() ?? { data: null, error: null }

  const builder: Record<string, unknown> = {}
  const passthrough = ['select', 'eq', 'neq', 'order', 'limit']
  for (const m of passthrough) builder[m] = jest.fn(() => builder)
  builder.update = jest.fn((p: unknown) => { updatePayloads.push(p); return builder })
  builder.insert = jest.fn((p: unknown) => { insertPayloads.push(p); return builder })
  builder.maybeSingle = jest.fn(async () => next())
  builder.single = jest.fn(async () => next())
  // Awaiting the builder directly (isSlugTaken/isDomainTaken) → empty list.
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })

  const from = jest.fn((t: string) => { tables.push(t); return builder })
  const client = { from } as unknown as ProvisioningCtx['client']
  return { client, from, builder, terminalQueue, updatePayloads, insertPayloads, tables }
}

const tenantInput = {
  name: 'Acme',
  slug: 'acme',
  domain: '',
  primary_color: '#111111',
  secondary_color: '#222222',
  messenger_page_id: '123',
  is_active: true,
  mapbox_enabled: false,
  enable_order_management: false,
  menu_engineering_enabled: false,
  checkout_upsell_enabled: false,
  bundles_enabled: false,
  distance_delivery_enabled: false,
  lalamove_enabled: true,
  lalamove_market: 'PH',
  lalamove_sandbox: true,
}

describe('updateTenantSupabase with an injected ProvisioningCtx (MCP path)', () => {
  beforeEach(() => cookieCreateClient.mockClear())

  it('updates the tenant via the injected client and never touches the cookie client', async () => {
    const stub = makeChainableClient()
    // 1) old-tenant domain lookup, 2) final update row
    stub.terminalQueue.push({ data: { domain: null }, error: null })
    stub.terminalQueue.push({ data: { id: TENANT, name: 'Acme' }, error: null })

    const ctx: ProvisioningCtx = { client: stub.client }
    const result = await updateTenantSupabase(TENANT, tenantInput as never, ctx)

    expect(result).toMatchObject({ id: TENANT })
    expect(stub.from).toHaveBeenCalledWith('tenants')
    expect(cookieCreateClient).not.toHaveBeenCalled()
    // integration fields flow into the update payload
    expect(stub.updatePayloads[0]).toMatchObject({ lalamove_enabled: true, lalamove_market: 'PH' })
  })
})

describe('createPaymentMethod with an injected ProvisioningCtx (MCP path)', () => {
  beforeEach(() => cookieCreateClient.mockClear())

  it('inserts via the injected client and never touches the cookie client', async () => {
    const stub = makeChainableClient()
    // 1) last order_index lookup, 2) inserted payment method row
    stub.terminalQueue.push({ data: null, error: null })
    stub.terminalQueue.push({ data: { id: 'pm_1', name: 'GCash' }, error: null })

    const ctx: ProvisioningCtx = { client: stub.client }
    const result = await createPaymentMethod(TENANT, 'GCash', 'ref', undefined, true, [], false, ctx)

    expect(result).toMatchObject({ id: 'pm_1' })
    expect(stub.from).toHaveBeenCalledWith('payment_methods')
    expect(cookieCreateClient).not.toHaveBeenCalled()
    expect(stub.insertPayloads[0]).toMatchObject({ tenant_id: TENANT, name: 'GCash' })
  })
})
