/**
 * Who owns a menu item's availability.
 *
 * `menu_items.auto_disabled_at` exists to answer one question: did this system
 * hide the item, or did the merchant? Auto-86 recovery is allowed to put back
 * only what it took, so the marker has to be released the moment a merchant
 * makes their own decision.
 *
 * Without that release the marker outlives its meaning and inverts into the
 * exact failure it was added to prevent:
 *
 *   1. stock runs out       → auto-86 hides the dish, stamps the marker
 *   2. merchant re-enables  → marker still set
 *   3. merchant hides it    → marker STILL set, on a deliberately hidden dish
 *   4. delivery arrives     → recovery puts it back on sale, against the
 *                             merchant's own choice
 *
 * Any manual toggle, in either direction, hands ownership back.
 */

import { toggleMenuItemAvailability } from '@/lib/admin-service'

const updatePayloads: unknown[] = []

function menuItemsTable() {
  const chain: Record<string, unknown> = {
    update: (payload: unknown) => {
      updatePayloads.push(payload)
      return chain
    },
    single: () => Promise.resolve({ data: { id: 'item-1' }, error: null }),
  }
  for (const method of ['eq', 'select']) chain[method] = () => chain
  return chain
}

/** An authenticated tenant admin with full permissions. */
function appUsersTable() {
  const chain: Record<string, unknown> = {
    maybeSingle: () =>
      Promise.resolve({
        data: { role: 'admin', tenant_id: 't1', is_owner: true, permissions: null },
        error: null,
      }),
  }
  for (const method of ['select', 'eq']) chain[method] = () => chain
  return chain
}

/**
 * A tenant whose subscription is current, so the gate `verifyTenantAdmin` now
 * applies lets the toggle through. Null would work too — that reads as "no
 * subscription configured" and is equally unblocked — but stating an active
 * one keeps this test about availability rather than about billing.
 */
function subscriptionsTable() {
  const chain: Record<string, unknown> = {
    maybeSingle: () =>
      Promise.resolve({
        data: {
          tenant_id: 't1',
          status: 'active',
          monthly_price_php: 649,
          paid_through: null,
          grace_days: 3,
        },
        error: null,
      }),
  }
  for (const method of ['select', 'eq']) chain[method] = () => chain
  return chain
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
      from: (name: string) => {
        if (name === 'app_users') return appUsersTable()
        if (name === 'tenant_subscriptions') return subscriptionsTable()
        return menuItemsTable()
      },
    }),
}))

beforeEach(() => {
  updatePayloads.length = 0
})

describe('a merchant toggling availability by hand', () => {
  it('releases the auto-86 marker when putting an item back on sale', async () => {
    await toggleMenuItemAvailability('item-1', 't1', true)

    expect(updatePayloads[0]).toEqual({ is_available: true, auto_disabled_at: null })
  })

  it('releases the auto-86 marker when taking an item off sale', async () => {
    // The case that matters most. A merchant hiding a dish that auto-86 had
    // previously stamped must not have that decision reversed by the next
    // delivery — so hiding it by hand clears the marker too.
    await toggleMenuItemAvailability('item-1', 't1', false)

    expect(updatePayloads[0]).toEqual({ is_available: false, auto_disabled_at: null })
  })
})
