/**
 * Browser QA for the `sample-demo` store (platform backend), phone + desktop.
 *
 * Needs the seed (`npx tsx scripts/seed/sample-demo-qa.ts`) and a dev server
 * (see playwright.qa.config.ts). Orders placed here carry a `QA-SEED` name,
 * so the seed teardown removes them. Page Designer edits are restored by
 * re-publishing the seeded designs at the end of the admin test.
 *
 * Every step screenshots into QA_SHOTS_DIR and records console errors, failed
 * requests and horizontal overflow. Steps that cannot run here (no map tiles,
 * no Apple Maps token for localhost…) are annotated, never faked.
 */
import { execSync } from 'child_process'
import { createHmac } from 'crypto'
import { mkdirSync } from 'fs'
import { join } from 'path'

import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { adminSessionCookies } from './admin-session'

const SHOTS = process.env.QA_SHOTS_DIR ?? join(process.cwd(), 'test-results', 'qa-shots')
const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL ?? 'admin@sampledemowebnegosyo.com'
const SLUG = 'sample-demo'
/** A seeded, pinned, pending delivery order (scripts/seed: order 1). */
const SEEDED_DELIVERY_ORDER = '81d7fad6-539f-512b-b4e0-4a93c803c007'
const FAKE_PHONE_LOCAL = '9000000099'
const NOISE = [/Download the React DevTools/, /\[Fast Refresh\]/, /\[HMR\]/, /favicon/, /_next\/webpack-hmr/, /sentry/i, /posthog/i, /facebook\.(com|net)/, /Tanstack/i]

mkdirSync(SHOTS, { recursive: true })

interface Watch {
  problems: string[]
}

function watch(page: Page): Watch {
  const problems: string[] = []
  const keep = (text: string) => !NOISE.some((pattern) => pattern.test(text))
  page.on('console', (message) => {
    if (message.type() === 'error' && keep(message.text())) problems.push(`console: ${message.text().slice(0, 300)}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message.slice(0, 300)}`))
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? ''
    if (keep(request.url()) && !/ERR_ABORTED/.test(failure)) problems.push(`requestfailed: ${request.url().slice(0, 160)} ${failure}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400 && keep(response.url())) problems.push(`http ${response.status()}: ${response.request().method()} ${response.url().slice(0, 160)}`)
  })
  return { problems }
}

/** Screenshot + overflow check; returns the shot's file name. */
async function shot(page: Page, info: TestInfo, name: string): Promise<string> {
  const file = `${info.project.name}-${name}.png`
  await page.screenshot({ path: join(SHOTS, file), fullPage: false })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 1) info.annotations.push({ type: 'overflow', description: `${file}: page is ${overflow}px wider than the viewport` })
  return file
}

function note(info: TestInfo, type: string, description: string) {
  info.annotations.push({ type, description })
  console.log(`[${info.project.name}] ${type}: ${description}`)
}

function report(info: TestInfo, seen: Watch) {
  for (const problem of [...new Set(seen.problems)]) note(info, 'browser-error', problem)
}

function trackingToken(orderId: string): string {
  const secret = process.env.API_SECRET
  if (!secret) throw new Error('API_SECRET missing')
  return createHmac('sha256', secret).update(orderId).digest('hex')
}

function serviceDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

async function settle(page: Page, ms = 1500) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(ms)
}

/** The item sheet stays open after "Add To Cart" on some builds; close it if it is. */
async function closeItemSheet(page: Page) {
  // The sheet may be sliding out on its own (slow under dev-server load): let it finish first.
  await page.waitForTimeout(1200)
  const back = page.getByRole('button', { name: 'Go back' })
  if (await back.isVisible().catch(() => false)) await back.click({ timeout: 5_000 }).catch(() => {})
  await page.waitForTimeout(800)
}

async function fillCart(page: Page, info: TestInfo) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await settle(page, 4000)
  await shot(page, info, '01-menu')

  await page.getByText('QA Chicken Inasal').first().click()
  await expect(page.getByRole('button', { name: 'Add To Cart' })).toBeVisible()
  await page.getByRole('button', { name: /^Large/ }).click()
  await page.getByRole('button', { name: 'Increase Extra rice' }).click()
  await expect(page.getByRole('button', { name: /^Large/ })).toBeVisible()
  await shot(page, info, '02-item-sheet')
  await page.getByRole('button', { name: 'Add To Cart' }).click()
  await page.waitForTimeout(1500)
  await closeItemSheet(page)

  await page.getByRole('button', { name: 'Add QA Fries' }).click()
  await page.getByRole('button', { name: 'Increase quantity', exact: true }).click()
  await page.getByRole('button', { name: 'Add To Cart' }).click()
  await page.waitForTimeout(1500)
  await closeItemSheet(page)

  // Auto-86: the seeded Cheese Bread's only ingredient is at zero.
  const cheeseBread = await page.getByRole('button', { name: 'Add QA Cheese Bread' }).count()
  note(info, 'auto-86', cheeseBread === 0 ? 'QA Cheese Bread is not orderable on the menu (stock 0) — expected' : 'QA Cheese Bread still has an Add button although its stock is 0')

  await page.goto('/cart', { waitUntil: 'domcontentloaded' })
  await settle(page, 3000)
  await expect(page.getByText('QA Chicken Inasal').first()).toBeVisible()
  await shot(page, info, '03-cart')
  await page.getByRole('button', { name: 'Proceed to Checkout' }).click()
  await page.waitForURL('**/checkout', { timeout: 120_000 })
  await settle(page, 6000)
}

async function applyVoucher(page: Page, info: TestInfo, code: string) {
  await page.getByRole('button', { name: 'Have a voucher?' }).click()
  await page.getByPlaceholder('Enter code').fill(code)
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.waitForTimeout(4000)
  await shot(page, info, `06-voucher-${code}`)
}

async function placeOrder(page: Page, info: TestInfo): Promise<string | null> {
  await page.getByText('PAY AS YOU ORDER').click()
  const proceed = page.getByRole('button', { name: /^(Proceed to Payment|Complete Order|Send Order via Messenger)/ })
  await proceed.click()
  await page.waitForTimeout(3000)
  await shot(page, info, '08-after-proceed')
  const finalButton = page.getByRole('button', { name: /^(Complete Order|Order Now|Place order|Confirm order|Submit order)/i }).last()
  if (await finalButton.isVisible().catch(() => false)) {
    await finalButton.click()
  }
  // The thank-you page shows for the seeded 8 s countdown before tracking takes over.
  const seenUrls = new Set<string>()
  for (let i = 0; i < 8; i += 1) {
    await page.waitForTimeout(1500)
    seenUrls.add(page.url().replace(/t=[0-9a-f]+/, 't=…'))
    await shot(page, info, `09-after-submit-${i}`)
  }
  note(info, 'after-submit-urls', [...seenUrls].join(' → '))
  await page.waitForURL(/\/order\/[0-9a-f-]{36}/, { timeout: 120_000 }).catch(() => undefined)
  const match = /\/order\/([0-9a-f-]{36})/.exec(page.url())
  return match?.[1] ?? null
}

test.describe('customer', () => {
  test('menu → item → cart → designed checkout → order → thank-you → tracking', async ({ page }, info) => {
    const seen = watch(page)
    await fillCart(page, info)
    await shot(page, info, '04-checkout')

    // Every order type shows its own questions.
    await page.getByRole('button', { name: 'Dine In', exact: true }).click()
    await expect(page.getByText('Someone’s birthday today (QA)')).toBeVisible()
    await page.getByRole('button', { name: 'Pick Up', exact: true }).click()
    await expect(page.getByText('Pickup day (QA)')).toBeVisible()
    await shot(page, info, '05a-pickup-questions')
    await page.getByRole('button', { name: 'Delivery', exact: true }).click()
    await expect(page.getByText('Need cutlery? (QA)')).toBeVisible()
    await shot(page, info, '05b-delivery-questions')

    const isPhone = info.project.name === 'phone'
    const guest = `QA-SEED E2E ${info.project.name}`
    if (isPhone) {
      await test.step('delivery: address search and map, then dine-in', async () => {
        await page.getByPlaceholder('Enter your name').fill(guest)
        const address = page.getByPlaceholder(/delivery address|Search your street/i)
        await address.fill('Quezon Avenue Lucena')
        await page.waitForTimeout(4000)
        await shot(page, info, '05c-address-search')
        const suggestions = await page.getByRole('option').count()
        note(info, 'address-search', `${suggestions} suggestion(s) for "Quezon Avenue Lucena"`)
        await page.keyboard.press('Escape')

        await page.getByRole('button', { name: 'Pick on the map' }).click()
        await page.waitForTimeout(5000)
        await shot(page, info, '05d-pick-on-map')
        const dialog = page.getByRole('dialog')
        if (await dialog.isVisible().catch(() => false)) {
          await page.keyboard.press('Escape')
          await page.waitForTimeout(800)
        } else {
          note(info, 'map', 'No map dialog opened from "Pick on the map"')
        }

        // "I can't find my place" was turned off 2026-11-09: a pin is the only way to price delivery here.
        await expect(page.getByRole('button', { name: /can.t find my place/ })).toHaveCount(0)
        await shot(page, info, '05e-no-pin-skip')
        // sample-demo can't quote Lalamove (sandbox keys in production mode), so the phone run orders dine-in.
        await page.getByRole('button', { name: 'Dine In', exact: true }).click()
        await page.getByPlaceholder('Enter your name').fill(guest)

        await page.getByPlaceholder('9XXXXXXXXX').fill(FAKE_PHONE_LOCAL)
        // Sample Demo's NUMBER "Date & Time" question belongs to Delivery; Dine In has none.
        const dateNumber = page.locator('input[type=number]').first()
        if (await dateNumber.isVisible().catch(() => false)) await dateNumber.fill('1')
        await page.getByText('No, thanks').click()
      })
      await applyVoucher(page, info, 'QA50FRIES')
      await expect(page.getByText(/QA50FRIES|50%/).first()).toBeVisible()
    } else {
      await test.step('pickup: date question (not placed)', async () => {
        await page.getByRole('button', { name: 'Pick Up', exact: true }).click()
        const day = page.locator('input[type=date]').first()
        await day.fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
        await shot(page, info, '05f-pickup-date')
      })
      await test.step('delivery: pin on the map', async () => {
        await page.getByRole('button', { name: 'Delivery', exact: true }).click()
        await page.getByPlaceholder('Enter your name').fill(guest)
        await page.getByPlaceholder('9XXXXXXXXX').fill(FAKE_PHONE_LOCAL)
        await page.locator('input[type=number]').first().fill('1')
        await page.getByText('Yes, please').click()
        const pickOnMap = page.getByRole('button', { name: 'Pick on the map' })
        if (!(await pickOnMap.isVisible({ timeout: 30_000 }).catch(() => false))) {
          // Seen once in three runs: the map links never rendered (MapKit not ready). Flaky, not faked.
          note(info, 'flaky', '"Pick on the map" did not render within 30 s; pin step skipped this run')
          await shot(page, info, '05g-no-map-links')
          return
        }
        await pickOnMap.click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await page.waitForTimeout(5000)
        // Drag the map so the pin leaves the store's own spot.
        const box = await dialog.locator('canvas').first().boundingBox()
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.mouse.down()
          await page.mouse.move(box.x + box.width / 2 - 220, box.y + box.height / 2 - 160, { steps: 12 })
          await page.mouse.up()
          await page.waitForTimeout(3000)
        } else {
          note(info, 'map', 'No map canvas found to drag')
        }
        await shot(page, info, '05g-map-dragged')
        const confirm = dialog.getByRole('button', { name: /Yes, this is the right|Confirm this spot/ })
        if (await confirm.isEnabled().catch(() => false)) {
          await confirm.click()
          await page.waitForTimeout(5000)
        } else {
          note(info, 'map', 'Confirm stayed disabled after dragging')
          await page.keyboard.press('Escape')
        }
        await shot(page, info, '05h-pinned')
        const unit = page.getByLabel(/House|Unit/).first()
        if (!(await unit.isVisible().catch(() => false))) await page.getByRole('button', { name: /Add unit, landmark or a note/ }).click().catch(() => undefined)
        await page.getByLabel(/House|Unit/).first().fill('QA Unit 7').catch(() => note(info, 'details', 'No unit field after pinning'))
        await page.getByLabel(/Landmark/).first().fill('QA green gate').catch(() => note(info, 'details', 'No landmark field after pinning'))
        await page.waitForTimeout(5000)
        await shot(page, info, '05i-pinned-details-fee')
        await page.screenshot({ path: join(SHOTS, `${info.project.name}-05j-pinned-full.png`), fullPage: true })
      })
      await test.step('pickup: required questions', async () => {
        await page.getByRole('button', { name: 'Pick Up', exact: true }).click()
        await page.getByPlaceholder('Enter your name').fill(guest)
        await page.getByPlaceholder('9XXXXXXXXX').fill(FAKE_PHONE_LOCAL)
        await page.locator('input[type=date]').first().fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
        await page.getByText('Small', { exact: true }).click().catch(() => undefined)
        const pickupSelect = page.locator('select').first()
        if (await pickupSelect.count()) {
          const options = await pickupSelect.locator('option').allTextContents()
          note(info, 'pickup-select', `"Pickup Date & Time" options: ${options.slice(0, 6).join(' | ') || '(none)'}`)
          if (options.length > 1) await pickupSelect.selectOption({ index: 1 })
        } else {
          note(info, 'pickup-select', 'no <select> for the required "Pickup Date & Time" question')
        }
        await shot(page, info, '05k-pickup-filled')
      })
      await test.step('dine-in: the order that is placed (pickup is blocked by an empty required select)', async () => {
        await page.getByRole('button', { name: 'Dine In', exact: true }).click()
        await page.getByPlaceholder('Enter your name').fill(guest)
        await page.getByPlaceholder('Enter table number').fill('QA 4')
        await page.getByText('Someone’s birthday today (QA)').click()
        await shot(page, info, '05l-dine-in-filled')
      })
      await applyVoucher(page, info, 'QA10OFF')
    }
    await shot(page, info, '07-ready-to-place')

    const orderId = await placeOrder(page, info)
    if (!orderId) {
      note(info, 'order', `No /order/<id> after placing (url ${page.url()})`)
    } else {
      note(info, 'order', `placed ${orderId}`)
      await page.goto(`/order/${orderId}?t=${trackingToken(orderId)}`, { waitUntil: 'domcontentloaded' })
      await settle(page, 6000)
      await shot(page, info, '10-tracking')
      await expect(page.getByText(/Order #\d+/).first()).toBeVisible()
      await page.getByText('Bill details').first().click()
      await expect(page.getByText(/QA Chicken Inasal/).first()).toBeVisible()
      await shot(page, info, '10b-tracking-bill')
      const { data } = await serviceDb().from('orders').select('customer_name, total, discount_total, customer_data, status').eq('id', orderId).single()
      note(info, 'order-row', JSON.stringify({ name: data?.customer_name, total: data?.total, discount: data?.discount_total, skipped: data?.customer_data?.delivery_pin_skipped ?? null, status: data?.status }))
      expect(data?.customer_name).toContain('QA-SEED')
    }
    report(info, seen)
  })

  test('seeded tracking page + saved addresses', async ({ page }, info) => {
    const seen = watch(page)
    await page.goto(`/order/${SEEDED_DELIVERY_ORDER}?t=${trackingToken(SEEDED_DELIVERY_ORDER)}`, { waitUntil: 'domcontentloaded' })
    await settle(page, 6000)
    await shot(page, info, '11-seeded-tracking')
    await expect(page.getByText(/Order #\d+/).first()).toBeVisible()
    report(info, seen)
  })
})

/**
 * Sample Demo's subscription is overdue, which parks every admin page on the
 * "account on hold" screen. For the admin run only, `paid_through` is moved a
 * week ahead and put back exactly afterwards (sample-demo's row only).
 */
let savedPaidThrough: string | null | undefined

async function sampleDemoTenantId(): Promise<string> {
  const { data, error } = await serviceDb().from('tenants').select('id, slug').eq('slug', SLUG).single()
  if (error || data?.slug !== SLUG) throw new Error(`sample-demo lookup failed: ${error?.message}`)
  return data.id as string
}

async function liftSubscriptionHold() {
  const tenantId = await sampleDemoTenantId()
  const db = serviceDb()
  const { data } = await db.from('tenant_subscriptions').select('paid_through').eq('tenant_id', tenantId).maybeSingle()
  if (!data) return
  savedPaidThrough = data.paid_through as string | null
  const ahead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const { data: rows, error } = await db.from('tenant_subscriptions').update({ paid_through: ahead }).eq('tenant_id', tenantId).select('tenant_id')
  if (error || rows?.length !== 1) throw new Error(`could not lift the hold: ${error?.message ?? 'no row'}`)
}

async function restoreSubscription() {
  if (savedPaidThrough === undefined) return
  const tenantId = await sampleDemoTenantId()
  const { data: rows, error } = await serviceDb().from('tenant_subscriptions').update({ paid_through: savedPaidThrough }).eq('tenant_id', tenantId).select('tenant_id')
  if (error || rows?.length !== 1) throw new Error(`could not restore paid_through=${savedPaidThrough}: ${error?.message ?? 'no row'}`)
  savedPaidThrough = undefined
}

test.describe('admin', () => {
  test.beforeAll(liftSubscriptionHold)
  test.afterAll(async () => {
    await restoreSubscription()
    // Undo the designer's publish and the delivery edits: the seed is idempotent
    // and puts the seeded designs and orders back exactly.
    execSync('npx tsx scripts/seed/sample-demo-qa.ts', { stdio: 'ignore', timeout: 300_000 })
  })

  test.beforeEach(async ({ context }) => {
    const cookies = await adminSessionCookies(ADMIN_EMAIL, `${SLUG}.localhost`)
    await context.addCookies(cookies)
  })

  test('reports + inventory load', async ({ page }, info) => {
    const seen = watch(page)
    await page.goto('/admin/reports', { waitUntil: 'domcontentloaded' })
    await settle(page, 6000)
    await shot(page, info, '20-reports')
    await expect(page.getByText('Net sales').filter({ visible: true }).first()).toBeVisible()
    await page.goto('/admin/reports/items', { waitUntil: 'domcontentloaded' })
    await settle(page, 5000)
    await shot(page, info, '21-reports-items')
    await page.goto('/admin/inventory', { waitUntil: 'domcontentloaded' })
    await settle(page, 6000)
    await shot(page, info, '22-inventory')
    await expect(page.getByText('QA Bread Roll').first()).toBeVisible()
    report(info, seen)
  })

  test('orders: delivery card, edit details, send pin link, move the pin', async ({ page, browser }, info) => {
    const seen = watch(page)
    await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' })
    await settle(page, 8000)
    await shot(page, info, '30-orders')
    await page.getByText('QA-SEED Juan').first().click()
    await page.waitForTimeout(3000)
    await shot(page, info, '30b-order-dialog')
    await page.getByRole('tab', { name: 'Delivery' }).click()
    const card = page.getByRole('region', { name: 'Delivery details' })
    await expect(card).toBeVisible()
    await card.scrollIntoViewIfNeeded()
    await shot(page, info, '31-delivery-card')
    await expect(card.getByText(/Blk 4 Lot 12/)).toBeVisible()

    await card.getByRole('button', { name: 'Edit details' }).click()
    const storeNote = page.locator('#delivery-store-note')
    const before = await storeNote.inputValue()
    await storeNote.fill(`QA e2e note ${info.project.name}`)
    await shot(page, info, '32-edit-details')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(/Delivery details saved/)).toBeVisible()
    await expect(card.getByText(`QA e2e note ${info.project.name}`)).toBeVisible()

    await card.getByRole('button', { name: 'Send pin link' }).click()
    const linkInput = page.locator(`#pin-link-${SEEDED_DELIVERY_ORDER}`)
    await expect(linkInput).toBeVisible()
    const link = await linkInput.inputValue()
    await shot(page, info, '33-pin-link')
    note(info, 'pin-link', link.replace(/t=[^&]+/, 't=…'))

    // A fresh customer context: no admin cookies.
    const customer = await browser.newContext(info.project.name === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } })
    const pinPage = await customer.newPage()
    const pinSeen = watch(pinPage)
    // The link as the merchant copies it, opened unchanged on this host.
    const local = link.replace(/^https?:\/\/[^/]+/, `http://${SLUG}.localhost:${process.env.QA_PORT ?? '3100'}`)
    await pinPage.goto(local, { waitUntil: 'domcontentloaded' })
    await settle(pinPage, 6000)
    await pinPage.screenshot({ path: join(SHOTS, `${info.project.name}-34-pin-page.png`) })
    await expect(pinPage.getByText('Where should the rider go?')).toBeVisible()
    await expect(pinPage.getByText('QA-SEED Juan')).toHaveCount(0)
    await pinPage.getByRole('button', { name: /Set your exact spot/ }).click()
    const pinDialog = pinPage.getByRole('dialog')
    await expect(pinDialog).toBeVisible()
    await pinPage.waitForTimeout(5000)
    const mapBox = await pinDialog.locator('canvas').first().boundingBox()
    if (mapBox) {
      await pinPage.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2)
      await pinPage.mouse.down()
      await pinPage.mouse.move(mapBox.x + mapBox.width / 2 + 180, mapBox.y + mapBox.height / 2 + 120, { steps: 12 })
      await pinPage.mouse.up()
      await pinPage.waitForTimeout(3000)
    }
    await pinPage.screenshot({ path: join(SHOTS, `${info.project.name}-34b-pin-moved.png`) })
    await pinDialog.getByRole('button', { name: /Yes, this is the right|Confirm this spot/ }).click()
    await pinPage.waitForTimeout(2000)
    await pinPage.locator('#pin-landmark').fill(`QA landmark ${info.project.name}`)
    const send = pinPage.getByRole('button', { name: /Send my spot/ })
    await expect(send).toBeEnabled()
    await send.click()
    await expect(pinPage.getByText('Thank you!')).toBeVisible()
    const { data: moved } = await serviceDb().from('orders').select('customer_data').eq('id', SEEDED_DELIVERY_ORDER).single()
    const movedData = (moved?.customer_data ?? {}) as Record<string, string>
    note(info, 'pin-moved', `lat=${movedData.delivery_lat} lng=${movedData.delivery_lng} landmark=${movedData.delivery_landmark} updated_by=${movedData.delivery_pin_updated_by ?? '-'}`)
    expect(movedData.delivery_landmark).toBe(`QA landmark ${info.project.name}`)
    await pinPage.screenshot({ path: join(SHOTS, `${info.project.name}-35-pin-page-after.png`) })
    for (const problem of pinSeen.problems) note(info, 'browser-error(pin)', problem)
    await customer.close()

    // The customer just moved the pin: a save from this (now stale) card must not overwrite it.
    await card.getByRole('button', { name: 'Edit details' }).click()
    await storeNote.fill(before)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Saving…' })).toHaveCount(0, { timeout: 120_000 })
    await shot(page, info, '36-stale-save')
    const toasts = await page.locator('[data-sonner-toast]').allInnerTexts()
    note(info, 'stale-save', toasts.join(' / ') || '(no toast)')
    const { data: after } = await serviceDb().from('orders').select('customer_data').eq('id', SEEDED_DELIVERY_ORDER).single()
    const afterData = (after?.customer_data ?? {}) as Record<string, string>
    note(info, 'stale-save-result', `landmark=${afterData.delivery_landmark} store_note=${afterData.delivery_store_note ?? '-'}`)
    report(info, seen)
  })

  test('page designer: templates, block style, show when/for, steps, look, questions, publish', async ({ page, context }, info) => {
    test.skip(info.project.name === 'phone', 'The designer is a desktop editor')
    const seen = watch(page)
    const soft = async (name: string, run: () => Promise<void>) => {
      try {
        await test.step(name, run)
      } catch (error) {
        note(info, 'designer-step-failed', `${name}: ${(error as Error).message.split('\n')[0]}`)
        await shot(page, info, `4x-failed-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 30)}`)
        await page.keyboard.press('Escape').catch(() => undefined)
      }
    }
    // The inspector's tabs are lower-case words shown capitalised by CSS.
    const inspectorTab = (name: string) => page.getByRole('tab', { name: new RegExp(`^${name}$`, 'i') }).filter({ visible: true }).last()
    const dumpPanel = async (label: string) => {
      if (!process.env.QA_DUMP) return
      const text = await page.evaluate(() => [...document.querySelectorAll('aside, [role=tabpanel], [data-inspector]')].map((e) => (e as HTMLElement).innerText.replace(/\n+/g, ' | ')).join(' ### ').slice(0, 1500))
      console.log(`--- ${label}: ${text}`)
    }

    for (const slug of ['thank-you', 'tracking', 'checkout']) {
      await page.goto(`/admin/page-designer/${slug}`, { waitUntil: 'domcontentloaded' })
      await settle(page, 8000)
      await shot(page, info, `40-designer-${slug}`)
    }
    const toolbarClipped = await page.evaluate(() => {
      const publish = [...document.querySelectorAll('button')].find((b) => /^(Publish|Published)$/.test(b.innerText.trim()))
      if (!publish) return 'no publish button'
      const box = publish.getBoundingClientRect()
      return box.right > window.innerWidth ? `Publish button is off-screen (right edge ${Math.round(box.right)}px > ${window.innerWidth}px)` : ''
    })
    if (toolbarClipped) {
      note(info, 'ui', `Page Designer toolbar at ${page.viewportSize()?.width}px: ${toolbarClipped}`)
      await page.getByRole('button', { name: 'Collapse sidebar' }).click().catch(() => undefined)
      await page.waitForTimeout(1500)
      const stillClipped = await page.evaluate(() => {
        const publish = [...document.querySelectorAll('button')].find((b) => /^(Publish|Published)$/.test(b.innerText.trim()))
        return publish ? publish.getBoundingClientRect().right > window.innerWidth : true
      })
      note(info, 'ui', stillClipped ? 'still off-screen with the admin sidebar collapsed' : 'reachable once the admin sidebar is collapsed')
      await shot(page, info, '40b-sidebar-collapsed')
    }

    await soft('templates gallery: switch to Step by step', async () => {
      await page.getByRole('button', { name: 'Templates' }).click()
      await page.waitForTimeout(2500)
      await shot(page, info, '41-templates')
      await page.getByRole('button', { name: 'Use the Step by step template' }).click({ force: true, timeout: 15_000 }).catch((error) => note(info, 'designer', `template card click: ${(error as Error).message.split('\n')[0]}`))
      await page.waitForTimeout(1500)
      const confirm = page.getByRole('button', { name: /Use this template|Use template|Replace|Apply/ }).first()
      if (await confirm.isVisible().catch(() => false)) await confirm.click()
      await page.waitForTimeout(2500)
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 60_000 })
      await page.getByRole('tab', { name: 'Layers' }).click()
      await expect(page.getByText('Review & place order').first()).toBeVisible()
      await shot(page, info, '42-step-by-step')
      await dumpPanel('after template')
    })

    await soft('block style: Order type design + colour', async () => {
      await page.getByRole('tab', { name: 'Layers' }).click()
      await page.getByText('Order type', { exact: true }).first().click()
      await page.waitForTimeout(1500)
      await dumpPanel('order type selected')
      await inspectorTab('Style').click()
      await page.waitForTimeout(1500)
      await shot(page, info, '43-order-type-style')
      await dumpPanel('order type style')
      const designs = page.locator('[aria-label*="design" i], [data-variant]')
      note(info, 'designer', `${await designs.count()} design choice element(s) in the Style tab`)
      if ((await designs.count()) > 1) await designs.nth(1).click()
      await page.waitForTimeout(1500)
      await shot(page, info, '44-order-type-design-2')
    })

    await soft('Show for + Show when', async () => {
      await page.getByText('Text me offers', { exact: true }).first().click()
      await page.waitForTimeout(1000)
      await inspectorTab('Content').click().catch(() => undefined)
      await page.waitForTimeout(1000)
      await dumpPanel('text me offers')
      await page.getByText('Show for', { exact: true }).first().scrollIntoViewIfNeeded()
      await shot(page, info, '45-show-for')
    })

    await soft('checkout questions editor', async () => {
      await page.getByText('Customer details', { exact: true }).first().click()
      await inspectorTab('Content').click().catch(() => undefined)
      await page.waitForTimeout(1500)
      await shot(page, info, '46-questions-editor')
      await dumpPanel('customer details content')
      const questions = page.getByText(/^questions$/i).filter({ visible: true }).first()
      await questions.scrollIntoViewIfNeeded()
      await shot(page, info, '46b-questions-list')
      // The list follows the order type chosen on the canvas (dine-in by default).
      await expect(page.getByText(/birthday today \(QA\)/).filter({ visible: true }).first()).toBeVisible()
    })

    await soft('Look tab', async () => {
      await page.getByRole('tab', { name: 'Look' }).click()
      await page.waitForTimeout(1500)
      await shot(page, info, '47-look')
      await dumpPanel('look')
    })

    await soft('preview', async () => {
      await page.getByRole('button', { name: 'Preview' }).click()
      await page.waitForTimeout(3000)
      await shot(page, info, '48-preview')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(1000)
    })

    await soft('publish + storefront reflects it', async () => {
      const publish = page.getByRole('button', { name: 'Publish', exact: true })
      await publish.click({ force: true })
      await expect(page.getByRole('button', { name: 'Published', exact: true })).toBeVisible({ timeout: 120_000 })
      await shot(page, info, '49-published')
      const store = await context.newPage()
      await store.goto('/checkout', { waitUntil: 'domcontentloaded' })
      await settle(store, 8000)
      await store.screenshot({ path: join(SHOTS, `${info.project.name}-50-storefront-after-publish.png`) })
      const stored = await serviceDb().from('tenants').select('checkout_design').eq('slug', SLUG).single()
      note(info, 'published-layout', `stored checkout layout = ${JSON.parse(String(stored.data?.checkout_design ?? '{}'))?.page?.layout ?? 'scroll'}`)
      await store.close()
    })

    report(info, seen)
  })

})
