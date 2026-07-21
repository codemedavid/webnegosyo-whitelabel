import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock the ops registry the mapper reads from. Inline jest.fn factory + require
// after mock (next/jest does not hoist jest.mock above ES imports).
jest.mock('@/lib/mcp/provisioning-ops', () => ({
  __esModule: true,
  listOps: jest.fn(),
  executeOp: jest.fn(),
}))

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const { listOps, executeOp } = jest.requireMock('@/lib/mcp/provisioning-ops') as any
const { registerProvisioningTools } = require('@/lib/mcp/register-tools')
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

import type { ProvisioningCtx } from '@/lib/provisioning/context'

const ctx = { client: {} as never } as ProvisioningCtx

// Minimal fake McpServer capturing registrations.
function makeServer() {
  const calls: Array<{ name: string; config: any; cb: (args: unknown) => Promise<unknown> }> = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  const registerTool = jest.fn((name: string, config: unknown, cb: (args: unknown) => Promise<unknown>) => {
    calls.push({ name, config: config as never, cb })
  })
  return { server: { registerTool }, registerTool, calls }
}

const OPS = [
  { name: 'create_tenant', description: 'Create a tenant', input: { parse: (v: unknown) => v } },
  { name: 'add_category', description: 'Add a category', input: { parse: (v: unknown) => v } },
]

beforeEach(() => {
  listOps.mockReset().mockReturnValue(OPS)
  executeOp.mockReset().mockResolvedValue({ id: 'tenant_1' })
})

describe('registerProvisioningTools', () => {
  it('registers one tool per op with its name, description, and input schema', () => {
    const { server, registerTool, calls } = makeServer()
    registerProvisioningTools(server, ctx)

    expect(registerTool).toHaveBeenCalledTimes(OPS.length)
    const create = calls.find((c) => c.name === 'create_tenant')!
    expect(create.config).toMatchObject({ description: 'Create a tenant' })
    expect(create.config.inputSchema).toBe(OPS[0].input)
  })

  it('dispatches a tool call through executeOp with the ctx and returns MCP text content', async () => {
    const { server, calls } = makeServer()
    registerProvisioningTools(server, ctx)

    const create = calls.find((c) => c.name === 'create_tenant')!
    const result = (await create.cb({ name: 'Acme', slug: 'acme' })) as { content: Array<{ type: string; text: string }> }

    expect(executeOp).toHaveBeenCalledWith('create_tenant', ctx, { name: 'Acme', slug: 'acme' })
    expect(result.content[0]).toMatchObject({ type: 'text' })
    expect(JSON.parse(result.content[0].text)).toMatchObject({ id: 'tenant_1' })
  })

  it('returns an isError MCP result when the op throws, without leaking a stack', async () => {
    const { server, calls } = makeServer()
    executeOp.mockRejectedValueOnce(new Error('slug already taken'))
    registerProvisioningTools(server, ctx)

    const create = calls.find((c) => c.name === 'create_tenant')!
    const result = (await create.cb({})) as { content: Array<{ type: string; text: string }>; isError?: boolean }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('slug already taken')
  })
})
