/**
 * The admin Orders table (2026-11-21 redesign) on sample-demo: status tabs with counts that match the
 * database, every filter in the address and applied in the query, search, the one-tap step (status
 * written, read back with the service role), the side panel, and the phone layout.
 *
 * The step test moves seeded order 9 (QA-SEED Miguel, dine-in, pending) to confirmed; cleanup's re-seed
 * puts it back to pending.
 */
import { expect, test } from '@playwright/test'

import { adminSessionCookies } from '../../../../tests/e2e/admin-session'
import { ADMIN_EMAIL, liftHold, note, report, restoreHold, saveJson, serviceDb, settle, shot, SLUG, TENANT_ID, watch } from './lib'

const MIGUEL = '28093a29-885d-5876-8145-ba7cde1597ca'
const STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] as const
const TAB_LABEL: Record<(typeof STATUSES)[number], string> = {
  pending: 'New',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  delivered: 'Completed',
  cancelled: 'Cancelled',
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  console.log(await liftHold())
})
test.afterAll(async () => {
  console.log(await restoreHold())
})
test.beforeEach(async ({ context }) => {
  await context.addCookies(await adminSessionCookies(ADMIN_EMAIL, `${SLUG}.localhost`))
})

/** Manila days [today − 6, tomorrow): sample-demo has no business-day cutoff (checked in the run). */
function last7Days(): { from: string; to: string } {
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
  const start = new Date(`${today}T00:00:00+08:00`).getTime()
  return { from: new Date(start - 6 * 86_400_000).toISOString(), to: new Date(start + 86_400_000).toISOString() }
}

async function dbCounts(window: { from: string; to: string } | null) {
  const counts: Record<string, number> = {}
  for (const status of STATUSES) {
    let query = serviceDb().from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID).eq('status', status)
    if (window) query = query.gte('created_at', window.from).lt('created_at', window.to)
    const { count } = await query
    counts[status] = count ?? 0
  }
  return counts
}

async function tabCount(page: import('@playwright/test').Page, label: string): Promise<number | null> {
  const text = await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: new RegExp(`^${label}`) }).innerText()
  const match = /(\d+)\s*$/.exec(text.trim())
  return match ? Number(match[1]) : null
}

test('orders table: tab counts = database, filters live in the address', async ({ page }, info) => {
  const seen = watch(page)
  const res = await page.goto('/admin/orders?range=7d', { waitUntil: 'domcontentloaded' })
  await settle(page, 8000)
  expect(res?.url() ?? '').not.toMatch(/subscription|login/)
  await shot(page, info, 'o1-orders-7d', true)

  const window = last7Days()
  const expected = await dbCounts(window)
  const shown: Record<string, number | null> = {}
  for (const status of STATUSES) shown[status] = await tabCount(page, TAB_LABEL[status])
  saveJson(`${info.project.name}-orders-tab-counts.json`, { window, expected, shown })
  note(info, 'tab-counts', `screen ${JSON.stringify(shown)} vs db ${JSON.stringify(expected)}`)
  expect(shown).toEqual(expected)

  // A status tab: the address changes, every row has that status, and the count is the DB's.
  await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Cancelled/ }).click()
  await expect(page).toHaveURL(/status=cancelled/)
  await settle(page, 4000)
  await shot(page, info, 'o2-cancelled-tab')
  const list = info.project.name === 'phone' ? page.getByRole('list', { name: /Orders/ }) : page.getByRole('table')
  if (expected.cancelled > 0) {
    await expect(list.getByText('Cancelled', { exact: true }).first()).toBeVisible()
    expect(await list.getByText(/^(New|Confirmed|Preparing|Ready|Completed)$/).count()).toBe(0)
  }
  await expect(page.getByText(new RegExp(`of ${expected.cancelled}$`))).toBeVisible()

  // Every order, all time: the total under the table is the store's whole history.
  await page.goto('/admin/orders?range=all', { waitUntil: 'domcontentloaded' })
  await settle(page, 5000)
  const { count: allCount } = await serviceDb().from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID)
  note(info, 'all-time-total', `db ${allCount}`)
  await expect(page.getByText(new RegExp(`of ${allCount}$`))).toBeVisible()
  await shot(page, info, 'o3-all-time', true)

  // Order type + payment filters in the address; every row is that type.
  await page.goto('/admin/orders?range=all&type=Pick%20Up&payment=paid', { waitUntil: 'domcontentloaded' })
  await settle(page, 5000)
  const { count: paidPickups } = await serviceDb()
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .eq('order_type', 'Pick Up')
    .in('payment_status', ['paid', 'verified'])
    .neq('status', 'cancelled')
  note(info, 'type-payment-filter', `db ${paidPickups}`)
  await expect(page.getByText(new RegExp(`of ${paidPickups}$`))).toBeVisible()
  await shot(page, info, 'o4-pickup-paid')

  // A page past the end (hand-edited, or orders moved away) is an empty page with a way back, not an error.
  await page.goto('/admin/orders?range=all&page=99', { waitUntil: 'domcontentloaded' })
  await settle(page, 5000)
  await expect(page.getByText(new RegExp(`^Nothing on this page · ${allCount} in all$`))).toBeVisible()
  await expect(page.getByRole('button', { name: 'Newer' })).toBeEnabled()
  await shot(page, info, 'o5-past-the-end')

  // No range in the address opens the last 7 days (an order left waiting overnight stays in view).
  await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' })
  await settle(page, 5000)
  for (const status of STATUSES) expect(await tabCount(page, TAB_LABEL[status])).toBe(expected[status])
  await report(page, info, seen, 'orders-table')
})

test('orders table: search finds a name, the panel opens with the delivery section', async ({ page }, info) => {
  const seen = watch(page)
  await page.goto('/admin/orders?range=all', { waitUntil: 'domcontentloaded' })
  await settle(page, 6000)
  await page.getByRole('searchbox', { name: /Search/ }).fill('QA-SEED Maria')
  await expect(page).toHaveURL(/q=QA-SEED\+Maria|q=QA-SEED%20Maria/)
  await settle(page, 4000)
  await expect(page.getByText(/^Showing 1–1 of 1$/)).toBeVisible()
  await shot(page, info, 's1-search-maria')

  // The daily number finds it too.
  await page.getByText('QA-SEED Maria').filter({ visible: true }).first().click()
  const panel = page.getByRole('dialog')
  await expect(panel.getByText(/^Order #04$/)).toBeVisible()
  await expect(panel.getByRole('region', { name: 'Delivery', exact: true })).toBeVisible()
  await expect(panel.getByRole('region', { name: 'Delivery details' })).toBeAttached()
  await expect(panel.getByRole('button', { name: 'Start order' })).toBeVisible()
  // The panel slides in over 500 ms; shoot it settled, and check it fits the screen.
  await page.waitForTimeout(900)
  const box = await panel.boundingBox()
  const width = page.viewportSize()?.width ?? 0
  note(info, 'panel-box', `x ${Math.round(box?.x ?? -1)} w ${Math.round(box?.width ?? -1)} of ${width}`)
  expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBeLessThanOrEqual(width)
  await shot(page, info, 's2-panel-maria')
  await report(page, info, seen, 'orders-search')
})

test('orders table: one tap moves a new order to confirmed (stored)', async ({ page }, info) => {
  const seen = watch(page)
  const before = await serviceDb().from('orders').select('status').eq('id', MIGUEL).single()
  test.skip(before.data?.status !== 'pending', `Miguel is ${before.data?.status}; re-seed first`)
  await page.goto('/admin/orders?range=all&q=QA-SEED%20Miguel', { waitUntil: 'domcontentloaded' })
  await settle(page, 6000)
  await shot(page, info, 't1-before-confirm')
  await page.getByRole('button', { name: /^Confirm order #/ }).filter({ visible: true }).first().click()
  await expect(page.getByText(/Order #\d+ · Confirmed/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Start order #/ }).filter({ visible: true }).first()).toBeVisible()
  const after = await serviceDb().from('orders').select('status, updated_at').eq('id', MIGUEL).single()
  saveJson(`${info.project.name}-miguel-after-confirm.json`, after.data)
  note(info, 'one-tap-confirm', `db status ${before.data?.status} → ${after.data?.status}`)
  expect(after.data?.status).toBe('confirmed')
  await shot(page, info, 't2-after-confirm')

  // Put it back for the other project through the panel's own status menu.
  await page.getByText('QA-SEED Miguel').filter({ visible: true }).first().click()
  const panel = page.getByRole('dialog')
  await panel.getByRole('combobox', { name: 'Order status' }).click()
  await page.getByRole('option', { name: 'New' }).click()
  await expect(page.getByText('Order marked new')).toBeVisible()
  // The panel shows the change at once (it used to keep the old status until the page refresh landed).
  await expect(panel.getByRole('combobox', { name: 'Order status' })).toHaveText('New', { timeout: 1500 })
  await expect(panel.getByRole('button', { name: 'Confirm order' })).toBeVisible({ timeout: 1500 })
  const reset = await serviceDb().from('orders').select('status').eq('id', MIGUEL).single()
  note(info, 'panel-status-reset', `db status → ${reset.data?.status}`)
  expect(reset.data?.status).toBe('pending')
  await shot(page, info, 't3-panel-reset')

  // Cancelling from the menu asks first; "Keep order" writes nothing.
  await panel.getByRole('combobox', { name: 'Order status' }).click()
  await page.getByRole('option', { name: 'Cancelled' }).click()
  const ask = page.getByRole('alertdialog')
  await expect(ask.getByText(/^Cancel order #\d+\?$/)).toBeVisible()
  await shot(page, info, 't4-cancel-asks')
  await ask.getByRole('button', { name: 'Keep order' }).click()
  await expect(ask).toBeHidden()
  const kept = await serviceDb().from('orders').select('status').eq('id', MIGUEL).single()
  note(info, 'cancel-kept', `db status ${kept.data?.status}`)
  expect(kept.data?.status).toBe('pending')
  await report(page, info, seen, 'orders-step')
})
