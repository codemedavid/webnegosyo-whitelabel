/**
 * Admin release checks on sample-demo: sales reports vs the database, the order delivery card
 * (edit details → stored, send pin link → public page shows only store + order number), and the
 * Page Designer (three pages render, Publish on screen at 1280px, step dots on the storefront).
 */
import { execSync } from 'child_process'

import { expect, test } from '@playwright/test'

import { adminSessionCookies } from '../../../../tests/e2e/admin-session'
import {
  ADMIN_EMAIL,
  fillCartToCheckout,
  liftHold,
  note,
  PORT,
  report,
  restoreHold,
  saveJson,
  serviceDb,
  settle,
  shot,
  SLUG,
  TENANT_ID,
  watch,
} from './lib'

/** Seeded order 2: QA-SEED Maria, confirmed delivery, pinned, with a store note. */
const ORDER_2 = '5692540f-3086-5a24-89b7-4a7d2f93e44d'

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

function manilaToday(): { from: string; to: string } {
  const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
  const from = new Date(`${day}T00:00:00+08:00`).toISOString()
  const to = new Date(new Date(from).getTime() + 86_400_000).toISOString()
  return { from, to }
}

test('reports: Net sales today on screen = database', async ({ page }, info) => {
  const seen = watch(page)
  const res = await page.goto('/admin/reports?period=today', { waitUntil: 'domcontentloaded' })
  await settle(page, 8000)
  await shot(page, info, 'r1-reports-today', true)
  expect(res?.url() ?? '').not.toMatch(/subscription|login/)
  const text = await page.locator('main').innerText().catch(() => page.locator('body').innerText())
  const netLine = /Net sales[\s\S]{0,80}?₱\s?([\d,]+(?:\.\d{1,2})?)/.exec(text)
  const shown = netLine ? Number(netLine[1].replace(/,/g, '')) : null
  const { from, to } = manilaToday()
  const { data } = await serviceDb().from('orders').select('total, delivery_fee, service_charge_amount, status').eq('tenant_id', TENANT_ID).gte('created_at', from).lt('created_at', to).limit(1000)
  const live = (data ?? []).filter((o) => !['cancelled', 'refunded', 'void', 'voided'].includes(String(o.status).toLowerCase()))
  const dbNet = Math.round(live.reduce((s, o) => s + Number(o.total) - Number(o.delivery_fee ?? 0) - Number(o.service_charge_amount ?? 0), 0) * 100) / 100
  saveJson(`${info.project.name}-reports-today.json`, { shown, dbNet, orders: live.length, window: { from, to } })
  note(info, 'reports-net', `screen ₱${shown} vs db ₱${dbNet} over ${live.length} live order(s) today`)
  // The KPI tile rounds to whole pesos.
  expect(shown).not.toBeNull()
  expect(Math.abs((shown ?? 0) - dbNet)).toBeLessThan(1)
  await expect(page.getByText(/^Today/).first()).toBeVisible()
  await page.goto('/admin/reports/items?period=today', { waitUntil: 'domcontentloaded' })
  await settle(page, 6000)
  await shot(page, info, 'r2-reports-items', true)
  await expect(page.getByText(/QA (Fries|Chicken Inasal)/).filter({ visible: true }).first()).toBeVisible()
  await report(page, info, seen, 'reports')
})

test('order delivery card: edit details stored, pin link page shows only store + order number', async ({ page, browser }, info) => {
  const seen = watch(page)
  await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' })
  await settle(page, 8000)
  await page.getByText('QA-SEED Maria').first().click()
  await page.waitForTimeout(3000)
  await page.getByRole('tab', { name: 'Delivery' }).click()
  const card = page.getByRole('region', { name: 'Delivery details' })
  await expect(card).toBeVisible()
  await shot(page, info, 'd1-delivery-card')
  await expect(card.getByText(/Unit 3B/)).toBeVisible()

  const marker = `QA verify note ${info.project.name} ${Date.now() % 100000}`
  await card.getByRole('button', { name: 'Edit details' }).click()
  await page.locator('#delivery-store-note').fill(marker)
  await shot(page, info, 'd2-edit-details')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/Delivery details saved/)).toBeVisible()
  const { data: saved } = await serviceDb().from('orders').select('customer_data, delivery_fee, total, updated_at').eq('id', ORDER_2).single()
  note(info, 'store-note-stored', `${saved?.customer_data?.delivery_store_note} (fee ${saved?.delivery_fee}, total ${saved?.total})`)
  expect(saved?.customer_data?.delivery_store_note).toBe(marker)
  expect(Number(saved?.delivery_fee)).toBe(59)

  await card.getByRole('button', { name: 'Send pin link' }).click()
  const linkInput = page.locator(`#pin-link-${ORDER_2}`)
  await expect(linkInput).toBeVisible()
  const link = await linkInput.inputValue()
  await shot(page, info, 'd3-pin-link')
  note(info, 'pin-link', link.replace(/([?&]t=)[^&]+/, '$1…'))

  const customer = await browser.newContext(info.project.name === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } })
  const pin = await customer.newPage()
  const pinSeen = watch(pin)
  const res = await pin.goto(link.replace(/^https?:\/\/[^/]+/, `http://${SLUG}.localhost:${PORT}`), { waitUntil: 'domcontentloaded' })
  await settle(pin, 6000)
  await pin.screenshot({ path: `${process.env.EVIDENCE}/shots/${info.project.name}-d4-pin-page.png`, fullPage: true })
  const pinText = await pin.locator('body').innerText()
  saveJson(`${info.project.name}-pin-page-text.json`, { status: res?.status(), text: pinText })
  const { data: order } = await serviceDb().from('orders').select('daily_order_number, order_number').eq('id', ORDER_2).single()
  const leaks = ['Maria', '9000000002', '0900 000 0002', 'Merchan', 'Unit 3B', 'Beside the church', 'Gate code', 'QA Chicken', 'QA Fries', marker, '13.937', '121.617'].filter((s) => pinText.includes(s))
  note(info, 'pin-page', `status ${res?.status()}; store shown=${pinText.includes('Sample Demo')}; order no ${JSON.stringify(order)}; leaks=${JSON.stringify(leaks)}`)
  expect(pinText).toContain('Sample Demo')
  expect(leaks).toEqual([])
  await report(pin, info, pinSeen, 'pin-page')
  await customer.close()
  await report(page, info, seen, 'orders')
})

test('page designer: three pages render, Publish on screen, steps publish → storefront dots', async ({ page, browser }, info) => {
  const seen = watch(page)
  const clipped: string[] = []
  for (const slug of ['checkout', 'thank-you', 'tracking']) {
    await page.goto(`/admin/page-designer/${slug}`, { waitUntil: 'domcontentloaded' })
    await settle(page, 8000)
    await shot(page, info, `p1-designer-${slug}`)
    const publish = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /^(Publish|Published)$/.test(x.innerText.trim()))
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { right: Math.round(r.right), width: window.innerWidth, visible: r.width > 0 && r.right <= window.innerWidth }
    })
    note(info, `designer-${slug}`, `Publish ${JSON.stringify(publish)}`)
    if (!publish?.visible) clipped.push(`${slug}: Publish right edge ${publish?.right}px > ${publish?.width}px`)
  }
  // Checked at the end so one clipped toolbar doesn't hide the rest of the journey.
  const assertToolbar = () => {
    if (info.project.name === 'desktop') expect(clipped, 'Publish on screen at 1280px on every page').toEqual([])
  }
  if (info.project.name === 'phone') {
    note(info, 'designer', 'phone: designer is a desktop editor; render + Publish position recorded only')
    await report(page, info, seen, 'designer')
    return
  }

  // Checkout: apply Step by step and publish, as the owner does.
  await page.goto('/admin/page-designer/checkout', { waitUntil: 'domcontentloaded' })
  await settle(page, 8000)
  await page.getByRole('button', { name: 'Templates' }).click()
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: 'Use the Step by step template' }).click({ force: true })
  await page.waitForTimeout(1500)
  const confirm = page.getByRole('dialog').getByRole('button', { name: /Use this template|Use template|Replace|Apply/ }).first()
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 60_000 })
  await shot(page, info, 'p2-step-by-step')
  await page.getByRole('button', { name: 'Publish', exact: true }).click({ force: true })
  await expect(page.getByRole('button', { name: 'Published', exact: true })).toBeVisible({ timeout: 120_000 })
  await shot(page, info, 'p3-published')
  const { data: t } = await serviceDb().from('tenants').select('checkout_design').eq('id', TENANT_ID).single()
  const layout = JSON.parse(String(t?.checkout_design ?? '{}'))?.page?.layout
  note(info, 'published-layout', `stored checkout layout=${layout}`)
  expect(layout).toBe('steps')
  const publishCalls = seen.actions.filter((a) => a.status !== undefined)
  note(info, 'admin-actions', publishCalls.map((a) => `${a.actionId.slice(0, 8)}:${a.status}`).join(' '))
  expect(publishCalls.some((a) => a.status === 403)).toBe(false)

  try {
    const storeContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const store = await storeContext.newPage()
    const storeSeen = watch(store)
    await fillCartToCheckout(store, info, 'p4')
    await shot(store, info, 'p5-storefront-steps')
    const dots = await store.locator('ol[aria-label="Steps"] [data-part="step"]').evaluateAll((els) =>
      els.map((e) => ({
        label: e.getAttribute('aria-label'),
        on: e.hasAttribute('data-on'),
        done: e.hasAttribute('data-done'),
        style: e.getAttribute('style'),
        bg: getComputedStyle(e).backgroundColor,
      })),
    )
    saveJson('desktop-step-dots.json', dots)
    const upcoming = dots.filter((d) => !d.on && !d.done)
    note(info, 'step-dots', `${dots.length} dots; upcoming bg=${upcoming.map((d) => d.bg).join(', ')}`)
    expect(dots.length).toBeGreaterThan(1)
    for (const d of upcoming) {
      expect(d.style ?? '').toContain('color-mix')
      expect(d.style ?? '').not.toContain('--co-border')
    }
    await report(store, info, storeSeen, 'storefront-steps')
    await storeContext.close()
  } finally {
    execSync('npx tsx scripts/seed/sample-demo-qa.ts', { stdio: 'ignore', timeout: 300_000 })
    const { data: back } = await serviceDb().from('tenants').select('checkout_design').eq('id', TENANT_ID).single()
    note(info, 'design-restored', `checkout layout after seed=${JSON.parse(String(back?.checkout_design ?? '{}'))?.page?.layout ?? 'scroll'}`)
  }
  await report(page, info, seen, 'designer')
  assertToolbar()
})
