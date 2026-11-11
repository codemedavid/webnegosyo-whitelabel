/**
 * @jest-environment node
 *
 * A staff route that is told "this order" checks it against the store's own
 * rows before acting: the store decides where its orders live (never the
 * request), a platform order must be the store's and, for a branch account,
 * its branch's. An order kept in the store's own deployment cannot be read
 * here, and the check says so instead of guessing.
 */

import { describe, expect, test } from '@jest/globals'
import { checkCallerOrder, resolveEventOutlet, savedOrderBearsOut } from '@/lib/auth/caller-order'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '99999999-9999-4999-8999-999999999999'
const ORDER = '7d1c3a2e-5b4f-4c8d-9e0a-1b2c3d4e5f60'
const NORTH = '22222222-2222-4222-8222-222222222222'
const SOUTH = '33333333-3333-4333-8333-333333333333'

const platformStore = { id: TENANT, order_backend: 'auto', convex_deployment_url: null }
const convexStore = { id: TENANT, order_backend: 'auto', convex_deployment_url: 'https://calm-owl-1.convex.cloud' }
const order = { id: ORDER, tenant_id: TENANT, outlet_id: NORTH, status: 'preparing', source: 'pos', total: '250.50' }

function db(tables: Record<string, ReadonlyArray<object>>, failures: Record<string, string> = {}) {
  return fakeSupabaseTables(tables, failures)
}

describe('checkCallerOrder', () => {
  test('hands back the saved order of a platform store', async () => {
    const { client } = db({ tenants: [platformStore], orders: [order] })

    expect(await checkCallerOrder(client, { tenantId: TENANT, orderId: ORDER, callerOutletId: null })).toEqual({
      backend: 'platform',
      order: { outletId: NORTH, status: 'preparing', source: 'pos', total: 250.5 },
    })
  })

  test('finds no order when it belongs to another store', async () => {
    const { client } = db({ tenants: [platformStore], orders: [{ ...order, tenant_id: OTHER_TENANT }] })

    expect(await checkCallerOrder(client, { tenantId: TENANT, orderId: ORDER, callerOutletId: null })).toEqual({
      backend: 'platform',
      order: null,
    })
  })

  test('finds no order for a branch account when it belongs to another branch, or to none', async () => {
    const elsewhere = db({ tenants: [platformStore], orders: [order] })
    const unassigned = db({ tenants: [platformStore], orders: [{ ...order, outlet_id: null }] })
    const input = { tenantId: TENANT, orderId: ORDER, callerOutletId: SOUTH }

    expect(await checkCallerOrder(elsewhere.client, input)).toEqual({ backend: 'platform', order: null })
    expect(await checkCallerOrder(unassigned.client, input)).toEqual({ backend: 'platform', order: null })
  })

  test('hands a branch account its own branch\'s order', async () => {
    const { client } = db({ tenants: [platformStore], orders: [order] })

    const check = await checkCallerOrder(client, { tenantId: TENANT, orderId: ORDER, callerOutletId: NORTH })

    expect(check).toMatchObject({ backend: 'platform', order: { outletId: NORTH } })
  })

  test('never asks the database for an id that cannot be a platform order', async () => {
    const { client, seen } = db({ tenants: [platformStore], orders: [order] })

    expect(await checkCallerOrder(client, { tenantId: TENANT, orderId: 'jd7abc123', callerOutletId: null })).toEqual({
      backend: 'platform',
      order: null,
    })
    expect(seen).toEqual(['tenants'])
  })

  test('reads an online order\'s source as online and a missing total as unknown', async () => {
    const { client } = db({ tenants: [platformStore], orders: [{ ...order, source: null, total: null }] })

    const check = await checkCallerOrder(client, { tenantId: TENANT, orderId: ORDER, callerOutletId: null })

    expect(check).toMatchObject({ order: { source: 'online', total: null } })
  })

  test('says the order cannot be read when the store keeps its orders in its own deployment', async () => {
    const { client, seen } = db({ tenants: [convexStore], orders: [order] })

    expect(await checkCallerOrder(client, { tenantId: TENANT, orderId: ORDER, callerOutletId: null })).toEqual({
      backend: 'convex',
    })
    expect(seen).toEqual(['tenants'])
  })

  test('a store pinned to the platform is a platform store whatever else its row holds', async () => {
    const pinned = { ...convexStore, order_backend: 'platform' }
    const { client } = db({ tenants: [pinned], orders: [order] })

    const check = await checkCallerOrder(client, { tenantId: TENANT, orderId: ORDER, callerOutletId: null })

    expect(check.backend).toBe('platform')
  })

  test('throws when the store or the order cannot be read: an unfinished check is never a pass', async () => {
    const input = { tenantId: TENANT, orderId: ORDER, callerOutletId: null }

    await expect(checkCallerOrder(db({ tenants: [platformStore] }, { tenants: 'timeout' }).client, input)).rejects.toThrow()
    await expect(checkCallerOrder(db({ tenants: [platformStore] }, { orders: 'timeout' }).client, input)).rejects.toThrow()
    await expect(checkCallerOrder(db({ tenants: [] }).client, input)).rejects.toThrow()
  })
})

describe('resolveEventOutlet', () => {
  const outlets = [{ id: NORTH, tenant_id: TENANT }, { id: SOUTH, tenant_id: OTHER_TENANT }]

  test('a branch account files under its own branch, whatever the request names', async () => {
    const { client, seen } = db({ outlets })

    expect(await resolveEventOutlet(client, { tenantId: TENANT, callerOutletId: NORTH, named: SOUTH })).toBe(NORTH)
    expect(await resolveEventOutlet(client, { tenantId: TENANT, callerOutletId: NORTH, named: null })).toBe(NORTH)
    expect(seen).toEqual([])
  })

  test('a store-wide account may name a branch of its store', async () => {
    const { client } = db({ outlets })

    expect(await resolveEventOutlet(client, { tenantId: TENANT, callerOutletId: null, named: NORTH })).toBe(NORTH)
  })

  test('a branch that is not the store\'s is dropped, not believed', async () => {
    const { client } = db({ outlets })

    expect(await resolveEventOutlet(client, { tenantId: TENANT, callerOutletId: null, named: SOUTH })).toBeNull()
    expect(await resolveEventOutlet(client, { tenantId: TENANT, callerOutletId: null, named: 'not-a-branch' })).toBeNull()
    expect(await resolveEventOutlet(client, { tenantId: TENANT, callerOutletId: null, named: null })).toBeNull()
  })

  test('throws when the branch cannot be read', async () => {
    const { client } = db({ outlets }, { outlets: 'timeout' })

    await expect(resolveEventOutlet(client, { tenantId: TENANT, callerOutletId: null, named: NORTH })).rejects.toThrow()
  })
})

describe('savedOrderBearsOut', () => {
  test.each([
    ['ready', 'ready'],
    ['cancelled', 'cancelled'],
    ['pending', 'confirmed'],
    ['confirmed', 'delivered'],
    ['preparing', 'ready'],
  ])('takes a report of %s for an order saved as %s', (reported, saved) => {
    expect(savedOrderBearsOut(reported, saved)).toBe(true)
  })

  test.each([
    ['delivered', 'ready'],
    ['ready', 'preparing'],
    ['cancelled', 'ready'],
    ['cancelled', 'delivered'],
    ['preparing', 'cancelled'],
    ['refunded', 'delivered'],
    ['ready', ''],
  ])('refuses a report of %s for an order saved as %s', (reported, saved) => {
    expect(savedOrderBearsOut(reported, saved)).toBe(false)
  })
})
