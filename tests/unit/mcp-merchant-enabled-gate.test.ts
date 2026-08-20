import { describe, it, expect, jest } from '@jest/globals'
import { executeMerchantOp } from '@/lib/mcp/merchant-ops'
import { isMerchantAuthorized } from '@/lib/mcp/merchant-gate'
import type { ProvisioningCtx } from '@/lib/provisioning/context'

/**
 * Merchant-side MCP — the `mcp_enabled` kill switch must actually switch.
 *
 * `tenants.mcp_enabled` is superadmin-controlled: it is the platform operator's
 * rollout gate and emergency off-switch for a merchant's AI connection. Gating
 * it only on the key-minting page is not enough — a tenant admin who drives the
 * OAuth endpoints directly can still mint a working credential, and a token
 * already issued keeps working forever after the flag is turned off.
 *
 * So it is enforced in two places:
 *  - `isMerchantAuthorized` — the authorize route's decision, which fails closed
 *    before any authorization code is issued, and
 *  - `executeMerchantOp` — every single dispatch, so flipping the flag off
 *    revokes live tokens on their very next call.
 */

const ctx = { client: {} as never } as ProvisioningCtx
const PINNED_TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('isMerchantAuthorized', () => {
  it('authorizes a tenant admin whose store has MCP enabled', () => {
    // Arrange
    const appUser = { role: 'admin', tenant_id: PINNED_TENANT }

    // Act
    const authorized = isMerchantAuthorized(appUser, true)

    // Assert
    expect(authorized).toBe(true)
  })

  it('refuses a tenant admin whose store has MCP disabled', () => {
    // Arrange
    const appUser = { role: 'admin', tenant_id: PINNED_TENANT }

    // Act
    const authorized = isMerchantAuthorized(appUser, false)

    // Assert
    expect(authorized).toBe(false)
  })

  it('fails closed when the flag is unreadable', () => {
    const appUser = { role: 'admin', tenant_id: PINNED_TENANT }

    expect(isMerchantAuthorized(appUser, null)).toBe(false)
    expect(isMerchantAuthorized(appUser, undefined)).toBe(false)
  })

  it('refuses a non-admin and an admin with no tenant binding, enabled or not', () => {
    expect(isMerchantAuthorized({ role: 'customer', tenant_id: PINNED_TENANT }, true)).toBe(false)
    expect(isMerchantAuthorized({ role: 'admin', tenant_id: null }, true)).toBe(false)
    expect(isMerchantAuthorized(null, true)).toBe(false)
  })
})

describe('executeMerchantOp — mcp_enabled enforcement', () => {
  it('dispatches when the pinned tenant has MCP enabled', async () => {
    // Arrange
    const execute = jest.fn(async () => ({ ok: true }))
    const isEnabled = jest.fn(async () => true)

    // Act
    const result = await executeMerchantOp('list_categories', ctx, PINNED_TENANT, {}, {
      execute: execute as never,
      isEnabled,
    })

    // Assert
    expect(result).toEqual({ ok: true })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('refuses to dispatch when the pinned tenant has MCP disabled', async () => {
    // Arrange
    const execute = jest.fn(async () => ({ ok: true }))
    const isEnabled = jest.fn(async () => false)

    // Act + Assert
    await expect(
      executeMerchantOp('list_categories', ctx, PINNED_TENANT, {}, {
        execute: execute as never,
        isEnabled,
      }),
    ).rejects.toThrow(/not enabled/i)

    // The op must never reach the registry.
    expect(execute).not.toHaveBeenCalled()
  })

  it('checks the flag before dispatching a WRITE op, not after', async () => {
    // Arrange — a disabled store must not have menu items created under it.
    const execute = jest.fn(async () => ({ ok: true }))
    const isEnabled = jest.fn(async () => false)

    // Act + Assert
    await expect(
      executeMerchantOp('add_menu_item', ctx, PINNED_TENANT, { name: 'Latte', price: 120 }, {
        execute: execute as never,
        isEnabled,
      }),
    ).rejects.toThrow(/not enabled/i)
    expect(execute).not.toHaveBeenCalled()
  })

  it('checks the flag against the PINNED tenant, never a smuggled one', async () => {
    // Arrange
    const execute = jest.fn(async () => ({ ok: true }))
    const isEnabled = jest.fn(async (_tenantId: string) => true)

    // Act
    await executeMerchantOp(
      'list_categories',
      ctx,
      PINNED_TENANT,
      { tenantId: '99999999-8888-7777-6666-555555555555' },
      { execute: execute as never, isEnabled },
    )

    // Assert
    expect(isEnabled).toHaveBeenCalledWith(PINNED_TENANT)
  })

  it('rejects an excluded op without even reading the flag', async () => {
    // Arrange
    const isEnabled = jest.fn(async () => true)

    // Act + Assert
    await expect(
      executeMerchantOp('create_tenant', ctx, PINNED_TENANT, {}, { isEnabled }),
    ).rejects.toThrow(/not available on the merchant surface/i)
    expect(isEnabled).not.toHaveBeenCalled()
  })
})
