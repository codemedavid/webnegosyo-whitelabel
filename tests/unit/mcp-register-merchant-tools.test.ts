import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock the merchant ops registry the mapper reads from. Inline jest.fn factory
// + require after mock (next/jest does not hoist jest.mock above ES imports).
jest.mock('@/lib/mcp/merchant-ops', () => ({
  __esModule: true,
  listMerchantOps: jest.fn(),
  executeMerchantOp: jest.fn(),
  MERCHANT_EXCLUDED_OPS: new Set(['create_tenant']),
}))

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { listMerchantOps, executeMerchantOp } = jest.requireMock('@/lib/mcp/merchant-ops') as any
const { registerMerchantTools } = require('@/lib/mcp/register-merchant-tools')
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import type { ProvisioningCtx } from '@/lib/provisioning/context'

const ctx = { client: {} as never } as ProvisioningCtx
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

// Minimal fake McpServer capturing registrations.
function makeServer() {
  const calls: Array<{ name: string; config: any; cb: (args: unknown, extra?: any) => Promise<unknown> }> = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  const registerTool = jest.fn((name: string, config: unknown, cb: (args: unknown, extra?: any) => Promise<unknown>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    calls.push({ name, config: config as never, cb })
  })
  return { server: { registerTool }, registerTool, calls }
}

const OPS = [
  { name: 'add_menu_item', description: 'Add a menu item to your menu', input: { parse: (v: unknown) => v } },
  { name: 'list_menu_items', description: 'List your menu items', input: { parse: (v: unknown) => v }, readOnly: true },
]

beforeEach(() => {
  listMerchantOps.mockReset().mockReturnValue(OPS)
  executeMerchantOp.mockReset().mockResolvedValue({ id: 'item_1' })
})

describe('registerMerchantTools', () => {
  it('registers one tool per merchant op advertising the tenant_admin scope', () => {
    const { server, registerTool, calls } = makeServer()
    registerMerchantTools(server, ctx)

    expect(registerTool).toHaveBeenCalledTimes(OPS.length)
    const add = calls.find((c) => c.name === 'add_menu_item')!
    expect(add.config).toMatchObject({ description: 'Add a menu item to your menu' })
    expect(add.config._meta.securitySchemes).toEqual([
      { type: 'oauth2', scopes: ['tenant_admin'] },
    ])
    const list = calls.find((c) => c.name === 'list_menu_items')!
    expect(list.config.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
  })

  it('returns an OAuth challenge pointing at the MERCHANT resource metadata when authorization is absent', async () => {
    const { server, calls } = makeServer()
    registerMerchantTools(server, ctx)

    const add = calls.find((c) => c.name === 'add_menu_item')!
    const result = (await add.cb({ name: 'Burger' }, {})) as {
      isError?: boolean
      _meta?: Record<string, unknown>
    }

    expect(result.isError).toBe(true)
    expect(result._meta?.['mcp/www_authenticate']).toEqual([
      expect.stringMatching(
        /resource_metadata="https:\/\/www\.webnegosyo\.com\/\.well-known\/oauth-protected-resource\/api\/mcp\/merchant".*scope="tenant_admin".*error="invalid_token"/,
      ),
    ])
    expect(executeMerchantOp).not.toHaveBeenCalled()
  })

  it('rejects a superadmin credential — merchant tools require the tenant_admin scope', async () => {
    const { server, calls } = makeServer()
    registerMerchantTools(server, ctx)

    const add = calls.find((c) => c.name === 'add_menu_item')!
    const result = (await add.cb(
      { name: 'Burger' },
      { authInfo: { token: 't', clientId: 'key_1', scopes: ['superadmin'], extra: { tenantId: null } } },
    )) as { isError?: boolean }

    expect(result.isError).toBe(true)
    expect(executeMerchantOp).not.toHaveBeenCalled()
  })

  it('fails closed when a tenant_admin credential carries no tenant binding', async () => {
    const { server, calls } = makeServer()
    registerMerchantTools(server, ctx)

    const add = calls.find((c) => c.name === 'add_menu_item')!
    const result = (await add.cb(
      { name: 'Burger' },
      { authInfo: { token: 't', clientId: 'key_m1', scopes: ['tenant_admin'], extra: { tenantId: null } } },
    )) as { isError?: boolean }

    expect(result.isError).toBe(true)
    expect(executeMerchantOp).not.toHaveBeenCalled()
  })

  it('dispatches through executeMerchantOp with the token-bound tenantId', async () => {
    const { server, calls } = makeServer()
    registerMerchantTools(server, ctx)

    const add = calls.find((c) => c.name === 'add_menu_item')!
    const result = (await add.cb(
      { name: 'Burger', price: 120 },
      { authInfo: { token: 't', clientId: 'key_m1', scopes: ['tenant_admin'], extra: { tenantId: TENANT_ID } } },
    )) as { content: Array<{ type: string; text: string }> }

    expect(executeMerchantOp).toHaveBeenCalledWith('add_menu_item', ctx, TENANT_ID, {
      name: 'Burger',
      price: 120,
    })
    expect(JSON.parse(result.content[0].text)).toMatchObject({ id: 'item_1' })
  })

  it('returns an isError MCP result when the op throws, without leaking a stack', async () => {
    const { server, calls } = makeServer()
    executeMerchantOp.mockRejectedValueOnce(new Error('price must be positive'))
    registerMerchantTools(server, ctx)

    const add = calls.find((c) => c.name === 'add_menu_item')!
    const result = (await add.cb(
      { name: 'Burger', price: -1 },
      { authInfo: { token: 't', clientId: 'key_m1', scopes: ['tenant_admin'], extra: { tenantId: TENANT_ID } } },
    )) as { content: Array<{ type: string; text: string }>; isError?: boolean }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('price must be positive')
  })
})
