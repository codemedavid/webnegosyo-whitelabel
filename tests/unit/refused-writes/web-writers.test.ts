/**
 * @jest-environment node
 *
 * Writers that used to report success for a write the database turned away.
 *
 * Row-level security refuses an UPDATE or DELETE without an error: zero rows
 * change and the response looks like any other. These writers checked only
 * `error`, so the screen said "deleted" while the row was still there. Each
 * test runs the real writer against the fake tables (`refuseWrites` = the
 * silent refusal) and pins three things: the write still works, a refused
 * write is reported, and a write with nothing left to do (the row is already
 * gone) is NOT turned into an error.
 */
import { NOTHING_CHANGED_MESSAGE } from '@/platform/db/assert-rows-changed'
import { fakeSupabaseTables, type FakeSupabaseOptions } from '../../fixtures/fake-supabase-tables'

type Fake = ReturnType<typeof fakeSupabaseTables>

let session: Fake
let serviceRole: Fake

jest.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve(session.client) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => serviceRole.client }))
// The caller is the store's owner: every permission check in code passes, so a
// refusal below can only come from the database.
jest.mock('@/lib/auth/request-caller', () => ({
  getRequestCaller: () =>
    Promise.resolve({
      user: { id: 'u-owner' },
      appUser: { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: null, outlet_id: null },
      roleError: null,
    }),
  getRequestSubscription: () => Promise.resolve(null),
}))

import { deleteCategory, deleteMenuItem } from '@/lib/admin-service'
import { deleteBoostPairing, saveBoostLastCall, setBoostPairingActive } from '@/lib/boost/writes'
import { deleteUpsellPair } from '@/lib/menu-engineering-service'
import { deleteCustomerFormField } from '@/lib/order-types-service'
import { createSupabaseOutletMenuRepository } from '@/lib/outlets/supabase-outlet-menu-repository'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { deletePaymentMethod } from '@/lib/payment-methods-service'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '99999999-9999-4999-8999-999999999999'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NORTH = 'o-north'
const SOUTH = 'o-south'

function tables() {
  return {
    categories: [{ id: A, tenant_id: TENANT }],
    menu_items: [
      { id: A, tenant_id: TENANT, show_in_checkout_upsell: true },
      { id: B, tenant_id: TENANT, show_in_checkout_upsell: false },
      { id: C, tenant_id: TENANT, show_in_checkout_upsell: false },
    ],
    payment_methods: [{ id: A, tenant_id: TENANT }],
    customer_form_fields: [{ id: A, tenant_id: TENANT }],
    upsell_pairs: [
      { id: 'pair-1', tenant_id: TENANT, pair_type: 'complementary', source_item_id: A, target_item_id: B, is_active: true },
      { id: 'pair-2', tenant_id: TENANT, pair_type: 'complementary', source_item_id: A, target_item_id: C, is_active: true },
      { id: 'pair-3', tenant_id: TENANT, pair_type: 'upgrade', source_item_id: B, target_item_id: C, is_active: true },
    ],
    outlet_menu_items: [{ tenant_id: TENANT, outlet_id: NORTH, menu_item_id: A, is_listed: false }],
    outlets: [
      { id: NORTH, tenant_id: TENANT, sort_order: 0 },
      { id: SOUTH, tenant_id: TENANT, sort_order: 1 },
    ],
    tenants: [{ id: TENANT }],
  }
}

function signIn(options: FakeSupabaseOptions = {}) {
  session = fakeSupabaseTables(tables(), {}, options)
  serviceRole = fakeSupabaseTables(tables())
}

const refused = (...names: string[]) => signIn({ refuseWrites: names })

async function rowsLeft(table: string, column = 'id'): Promise<unknown[]> {
  const { data } = await session.client.from(table).select(column).eq('tenant_id', TENANT)
  return (data ?? []).map((row) => (row as unknown as Record<string, unknown>)[column])
}

beforeEach(() => signIn())

/** The same three promises for every delete of one row by id. */
describe.each([
  ['a category', 'categories', () => deleteCategory(A, TENANT)],
  ['a dish', 'menu_items', () => deleteMenuItem(A, TENANT)],
  ['a payment method', 'payment_methods', () => deletePaymentMethod(A, TENANT)],
  ['a checkout question', 'customer_form_fields', () => deleteCustomerFormField(A, TENANT)],
  ['an upgrade or pairing row', 'upsell_pairs', () => deleteUpsellPair('pair-1', TENANT)],
])('deleting %s', (_what, table, remove) => {
  it('deletes it', async () => {
    const before = (await rowsLeft(table)).length

    await remove()

    expect(await rowsLeft(table)).toHaveLength(before - 1)
  })

  it('reports a delete the database refused, instead of saying it was deleted', async () => {
    refused(table)

    await expect(remove()).rejects.toThrow(NOTHING_CHANGED_MESSAGE)
  })

  it('is fine when it is already gone: the second tap of a double tap', async () => {
    await remove()

    await expect(remove()).resolves.not.toThrow()
  })
})

describe('switching a pairing on or off', () => {
  it('switches every row of the offer', async () => {
    await setBoostPairingActive(TENANT, [A], false)

    const { data } = await session.client.from('upsell_pairs').select('id').eq('is_active', false)
    expect(data).toEqual([{ id: 'pair-1' }, { id: 'pair-2' }])
  })

  it('reports a switch the database refused', async () => {
    refused('upsell_pairs')

    await expect(setBoostPairingActive(TENANT, [A], false)).rejects.toThrow(NOTHING_CHANGED_MESSAGE)
  })

  it('reports a pairing that no longer exists, rather than showing it switched', async () => {
    await expect(setBoostPairingActive(TENANT, [C], false)).rejects.toThrow(NOTHING_CHANGED_MESSAGE)
  })
})

describe('deleting a pairing', () => {
  it('deletes every row of the offer and leaves upgrades alone', async () => {
    await deleteBoostPairing(TENANT, [A])

    expect(await rowsLeft('upsell_pairs')).toEqual(['pair-3'])
  })

  it('reports a delete the database refused', async () => {
    refused('upsell_pairs')

    await expect(deleteBoostPairing(TENANT, [A])).rejects.toThrow(NOTHING_CHANGED_MESSAGE)
  })

  it('is fine when the pairing is already gone', async () => {
    await deleteBoostPairing(TENANT, [A])

    await expect(deleteBoostPairing(TENANT, [A])).resolves.toBeUndefined()
  })
})

describe("saving the cart's last call", () => {
  const input = (pickedItemIds: string[]) => ({ enabled: true, title: 'Before you go', subtitle: '', maxItems: 4, pickedItemIds })
  const picked = async () => {
    const { data } = await session.client.from('menu_items').select('id').eq('show_in_checkout_upsell', true)
    return (data ?? []).map((row) => (row as unknown as { id: string }).id)
  }

  it('replaces the picks', async () => {
    await saveBoostLastCall(TENANT, input([B, C]))

    expect(await picked()).toEqual([B, C])
  })

  it('reports picks the database refused to store', async () => {
    refused('menu_items')

    await expect(saveBoostLastCall(TENANT, input([B, C]))).rejects.toThrow(NOTHING_CHANGED_MESSAGE)
    expect(await picked()).toEqual([A])
  })

  it('reports old picks the database refused to clear, when the owner switches back to automatic', async () => {
    refused('menu_items')

    await expect(saveBoostLastCall(TENANT, input([]))).rejects.toThrow(NOTHING_CHANGED_MESSAGE)
  })

  it('is fine when there were no picks to clear', async () => {
    await saveBoostLastCall(TENANT, input([]))

    await expect(saveBoostLastCall(TENANT, input([]))).resolves.toBeUndefined()
    expect(await picked()).toEqual([])
  })
})

describe("returning a dish to the store-wide menu at one branch", () => {
  const clear = () => createSupabaseOutletMenuRepository().clear(TENANT, NORTH, A)

  it('removes the branch row', async () => {
    await clear()

    expect(await rowsLeft('outlet_menu_items', 'menu_item_id')).toEqual([])
  })

  it('reports a removal the database refused: the dish is still delisted at that branch', async () => {
    refused('outlet_menu_items')

    await expect(clear()).rejects.toThrow(NOTHING_CHANGED_MESSAGE)
  })

  it('is fine when the branch never differed from the store', async () => {
    await clear()

    await expect(clear()).resolves.toBeUndefined()
  })
})

describe('reordering branches', () => {
  const reorder = (ids: string[]) => createSupabaseOutletRepository().reorder(TENANT, ids)
  const order = async () => {
    const { data } = await session.client.from('outlets').select('id').eq('tenant_id', TENANT).order('sort_order')
    return (data ?? []).map((row) => (row as unknown as { id: string }).id)
  }

  it('stores the new order', async () => {
    await reorder([SOUTH, NORTH])

    expect(await order()).toEqual([SOUTH, NORTH])
  })

  it('reports an order the database refused to store', async () => {
    refused('outlets')

    await expect(reorder([SOUTH, NORTH])).rejects.toThrow(NOTHING_CHANGED_MESSAGE)
    expect(await order()).toEqual([NORTH, SOUTH])
  })

  it('skips a branch that was deleted meanwhile, or is not this store\'s, without failing the rest', async () => {
    session = fakeSupabaseTables({ ...tables(), outlets: [...tables().outlets, { id: 'o-theirs', tenant_id: OTHER_TENANT, sort_order: 0 }] })

    await expect(reorder([SOUTH, 'o-deleted', 'o-theirs', NORTH])).resolves.toBeUndefined()
    expect(await order()).toEqual([SOUTH, NORTH])
  })
})
