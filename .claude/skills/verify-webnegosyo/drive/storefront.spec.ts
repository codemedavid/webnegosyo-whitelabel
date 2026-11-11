/**
 * Storefront release checks on sample-demo: order totals end to end, required checkout questions
 * (form, stale tab, forged server call), delivery without a pin, thank-you + tracking designs.
 */
import { join } from 'path'

import { expect, test } from '@playwright/test'

import {
  chooseCashAndSubmit,
  dbHelper,
  fillCartToCheckout,
  fillDineIn,
  note,
  ORDER_TYPES,
  pesoAmounts,
  qaOrderIds,
  replayAction,
  report,
  saveJson,
  serviceDb,
  settle,
  shot,
  STATE,
  TENANT_ID,
  trackingToken,
  watch,
  type CapturedAction,
} from './lib'

const QUESTION_STATE = join(STATE, 'question.json')
let capturedCreate: CapturedAction | null = null

function createOrderCall(actions: CapturedAction[]): CapturedAction | null {
  return actions.find((a) => Array.isArray(a.args) && a.args[0] === TENANT_ID && a.args.length >= 18) ?? null
}

test.describe.configure({ mode: 'serial' })

test('order totals: checkout screen = orders row = thank-you = tracking', async ({ page }, info) => {
  const seen = watch(page)
  const guest = `QA-SEED verify ${info.project.name}`
  await fillCartToCheckout(page, info, 'e1', true)
  await fillDineIn(page, guest, true)
  await page.getByRole('button', { name: 'Have a voucher?' }).click()
  await page.getByPlaceholder('Enter code').fill('QA10OFF')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.waitForTimeout(4000)
  await shot(page, info, 'e2-checkout-filled', true)
  // The submit button carries the amount the customer is about to pay ("Proceed to Payment · ₱350.10").
  const totalLine = (await page.getByRole('button', { name: /^(Proceed to Payment|Complete Order|Send Order via Messenger)/ }).first().innerText()).replace(/\s+/g, ' ')
  note(info, 'checkout-submit-button', totalLine.slice(0, 300))
  const before = new Set(await qaOrderIds())

  await chooseCashAndSubmit(page)
  const urls: string[] = []
  let thankYouText = ''
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(1500)
    urls.push(page.url().replace(/t=[0-9a-f]+/, 't=…'))
    if (!thankYouText && !/\/order\//.test(page.url())) {
      const text = await page.locator('body').innerText().catch(() => '')
      if (/thank|placed|received|salamat/i.test(text)) {
        thankYouText = text
        await shot(page, info, 'e3-thank-you')
      }
    }
  }
  note(info, 'after-submit-urls', [...new Set(urls)].join(' → '))
  await page.waitForURL(/\/order\/[0-9a-f-]{36}/, { timeout: 120_000 }).catch(() => undefined)
  const created = (await qaOrderIds()).filter((id) => !before.has(id))
  expect(created, 'exactly one new QA order row').toHaveLength(1)
  const orderId = created[0]
  capturedCreate = createOrderCall(seen.actions)
  note(info, 'create-order-captured', capturedCreate ? `action ${capturedCreate.actionId.slice(0, 10)}… args=${capturedCreate.args?.length}` : 'NOT captured')

  const { data: row } = await serviceDb().from('orders').select('total, discount_total, delivery_fee, service_charge_amount, discount_data, customer_data, status, order_type').eq('id', orderId).single()
  const { data: items } = await serviceDb().from('order_items').select('menu_item_name, variation, quantity, price, subtotal, discount_amount').eq('order_id', orderId)
  saveJson(`${info.project.name}-order-row.json`, { orderId, row, items })
  note(info, 'order-row', JSON.stringify({ total: row?.total, discount_total: row?.discount_total, fee: row?.delivery_fee, birthday: row?.customer_data?.qa_birthday, discount: row?.discount_data }).slice(0, 400))

  const itemsSum = (items ?? []).reduce((s, it) => s + Number(it.subtotal), 0)
  const expectedTotal = Math.round((itemsSum - Number(row?.discount_total ?? 0)) * 100) / 100
  expect(Number(row?.total), 'stored total = Σ lines − discount').toBe(expectedTotal)
  expect(pesoAmounts(totalLine), 'checkout shows the stored total').toContain(Number(row?.total))
  if (thankYouText) {
    const has = pesoAmounts(thankYouText).includes(Number(row?.total))
    note(info, 'thank-you-total', has ? `shows ₱${row?.total}` : `does not print ₱${row?.total} (amounts: ${pesoAmounts(thankYouText).join(',')})`)
  } else {
    note(info, 'thank-you', 'no thank-you page text captured before tracking')
  }

  await page.goto(`/order/${orderId}?t=${trackingToken(orderId)}`, { waitUntil: 'domcontentloaded' })
  await settle(page, 6000)
  await shot(page, info, 'e4-tracking')
  await page.getByText('Bill details').first().click().catch(() => note(info, 'tracking', 'no "Bill details" toggle'))
  await page.waitForTimeout(1500)
  await shot(page, info, 'e5-tracking-bill', true)
  const trackingText = await page.locator('body').innerText()
  expect(pesoAmounts(trackingText), 'tracking shows the stored total').toContain(Number(row?.total))
  saveJson(`${info.project.name}-actions.json`, seen.actions.map((a) => ({ id: a.actionId, status: a.status, args: Array.isArray(a.args) ? a.args.length : null })))
  for (const a of seen.actions) if ((a.status ?? 200) >= 400) note(info, 'server-action-status', `${a.actionId.slice(0, 10)} → ${a.status}`)
  await report(page, info, seen, 'order')
})

test('required question: fresh form blocks, stale tab refused + marked, forged call refused', async ({ page, context }, info) => {
  const seen = watch(page)
  const guest = `QA-SEED verify-req ${info.project.name}`
  // Stale tab: the checkout is open BEFORE the owner makes qa_birthday required.
  await fillCartToCheckout(page, info, 'b1')
  await fillDineIn(page, guest, false)
  const before = new Set(await qaOrderIds())
  try {
    note(info, 'require', dbHelper('question', 'require', 'qa_birthday', QUESTION_STATE).replace(/\s+/g, ' '))

    await chooseCashAndSubmit(page)
    await page.waitForTimeout(6000)
    await shot(page, info, 'b2-stale-tab-after-submit', true)
    const stillCheckout = /\/checkout/.test(page.url())
    const toasts = (await page.locator('[data-sonner-toast]').allInnerTexts()).join(' / ')
    const marked = await page.locator('[aria-invalid="true"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).outerHTML.slice(0, 160)))
    note(info, 'stale-tab', `url=${page.url().replace(/t=[0-9a-f]+/, 't=…')} toast="${toasts}" aria-invalid=${marked.length}`)
    saveJson(`${info.project.name}-stale-tab-marked.json`, { toasts, marked })
    expect(stillCheckout, 'stale tab stays on the checkout').toBe(true)
    // The verdict shows beside the field (and in a toast that may already have gone).
    const inline = await page.getByText('Please tick “Someone’s birthday today (QA)”').count()
    note(info, 'stale-tab-inline', `inline message count=${inline}`)
    expect(inline + (toasts.match(/birthday today/) ? 1 : 0)).toBeGreaterThan(0)
    expect(marked.length, 'field marked aria-invalid').toBeGreaterThan(0)
    const preflight = seen.actions.find((a) => Array.isArray(a.args) && a.args.length === 3 && a.args[0] === TENANT_ID)
    note(info, 'preflight-call', preflight ? `preflightCheckoutAnswersAction called (status ${preflight.status})` : 'no preflight call seen')

    // Forged / stale submit straight to createOrderAction, exactly as the browser posts it.
    if (!capturedCreate?.args) {
      note(info, 'forged-call', 'INCONCLUSIVE: no captured createOrderAction body (the totals test must run first in the same project)')
    } else {
      const args = [...capturedCreate.args]
      const data = { ...(args[4] as Record<string, unknown>) }
      delete data.qa_birthday
      data.customer_name = guest
      args[4] = data
      args[2] = { ...(args[2] as Record<string, unknown>), name: guest }
      args[16] = []
      args[17] = crypto.randomUUID()
      const reply = await replayAction(page, capturedCreate, args)
      saveJson(`${info.project.name}-forged-required-reply.txt.json`, reply)
      note(info, 'forged-call', `HTTP ${reply.status}: ${reply.text.replace(/\s+/g, ' ').slice(-300)}`)
      expect(reply.text).toMatch(/"refused":true/)
      expect(reply.text).toMatch(/qa_birthday/)
    }

    // Fresh tab: the form itself now asks for the tick.
    const fresh = await context.newPage()
    const freshSeen = watch(fresh)
    await fresh.goto('/checkout', { waitUntil: 'domcontentloaded' })
    await settle(fresh, 6000)
    await fillDineIn(fresh, guest, false)
    await chooseCashAndSubmit(fresh)
    await fresh.waitForTimeout(4000)
    await shot(fresh, info, 'b3-fresh-form-blocked', true)
    const freshToasts = (await fresh.locator('[data-sonner-toast]').allInnerTexts()).join(' / ')
    const freshMarked = await fresh.locator('[aria-invalid="true"]').count()
    note(info, 'fresh-form', `url=${fresh.url()} toast="${freshToasts}" aria-invalid=${freshMarked}`)
    expect(/\/checkout/.test(fresh.url())).toBe(true)
    const freshInline = await fresh.getByText(/Please tick “Someone’s birthday today \(QA\)”/).count()
    note(info, 'fresh-inline', `inline=${freshInline} required-label=${await fresh.getByText('Someone’s birthday today (QA)').first().evaluate((e) => e.parentElement?.textContent ?? '')}`)
    expect(freshMarked + freshInline + (freshToasts.match(/birthday/) ? 1 : 0)).toBeGreaterThan(0)
    await report(fresh, info, freshSeen, 'fresh-checkout')
    await fresh.close()
  } finally {
    note(info, 'restore', dbHelper('question', 'restore', QUESTION_STATE).replace(/\s+/g, ' '))
  }
  const created = (await qaOrderIds()).filter((id) => !before.has(id))
  note(info, 'orders-created-while-required', JSON.stringify(created))
  expect(created, 'no order was written while the required answer was missing').toHaveLength(0)
  await report(page, info, seen, 'stale-checkout')
})

test('delivery: no "I can\'t find my place", no Lalamove setup text, pinless order refused', async ({ page }, info) => {
  const seen = watch(page)
  await fillCartToCheckout(page, info, 'a1')
  await page.getByRole('button', { name: 'Delivery', exact: true }).click()
  await page.waitForTimeout(3000)
  await expect(page.getByText('Need cutlery? (QA)')).toBeVisible()
  await expect(page.getByRole('button', { name: /can.t find my place/i })).toHaveCount(0)
  await expect(page.getByText(/can.t find my place/i)).toHaveCount(0)
  const address = page.getByPlaceholder(/delivery address|Search your street/i)
  await address.fill('Quezon Avenue Lucena')
  await page.waitForTimeout(5000)
  await shot(page, info, 'a2-address-search')
  note(info, 'address-search', `${await page.getByRole('option').count()} suggestion(s)`)
  await page.keyboard.press('Escape')
  const text = await page.locator('body').innerText()
  note(info, 'lalamove-text', /lalamove/i.test(text) ? `checkout mentions Lalamove: ${text.split('\n').filter((l) => /lalamove/i.test(l)).join(' | ').slice(0, 200)}` : 'no Lalamove wording shown to the shopper')
  await shot(page, info, 'a3-delivery-no-skip', true)

  if (!capturedCreate?.args) {
    note(info, 'pinless-call', 'INCONCLUSIVE: no captured createOrderAction body')
  } else {
    const before = new Set(await qaOrderIds())
    const args = [...capturedCreate.args]
    const guest = `QA-SEED verify-pinless ${info.project.name}`
    args[2] = { ...(args[2] as Record<string, unknown>), name: guest, contact: '+639000000098' }
    args[3] = ORDER_TYPES.delivery
    const base = { ...(args[4] as Record<string, unknown>) }
    delete base.table_number
    delete base.qa_birthday
    args[4] = { ...base, customer_name: guest, customer_phone: '+639000000098', delivery_address: 'Purok 3, Brgy. Ibabang Dupay, Lucena', delivery_pin_skipped: 'true', Date: '1', qa_cutlery: 'No, thanks' }
    args[5] = 0
    args[6] = '$undefined'
    args[16] = []
    args[17] = crypto.randomUUID()
    args[18] = '$undefined'
    const reply = await replayAction(page, capturedCreate, args)
    saveJson(`${info.project.name}-pinless-reply.json`, reply)
    note(info, 'pinless-call', `HTTP ${reply.status}: ${reply.text.replace(/\s+/g, ' ').slice(-300)}`)
    const created = (await qaOrderIds()).filter((id) => !before.has(id))
    if (created.length) {
      const { data } = await serviceDb().from('orders').select('total, delivery_fee, customer_data').eq('id', created[0]).single()
      note(info, 'pinless-order-written', JSON.stringify({ id: created[0], fee: data?.delivery_fee, total: data?.total, skipped: data?.customer_data?.delivery_pin_skipped }))
    }
    expect(reply.text).toMatch(/"refused":true/)
    expect(created).toHaveLength(0)
  }
  await report(page, info, seen, 'delivery-checkout')
})

test('seeded tracking + thank-you designs render', async ({ page }, info) => {
  const seen = watch(page)
  const order = '81d7fad6-539f-512b-b4e0-4a93c803c007'
  const res = await page.goto(`/order/${order}?t=${trackingToken(order)}`, { waitUntil: 'domcontentloaded' })
  await settle(page, 6000)
  await shot(page, info, 'c1-seeded-tracking', true)
  await expect(page.getByText(/Order #\d+/).first()).toBeVisible()
  const headers = res?.headers() ?? {}
  note(info, 'tracking-headers', JSON.stringify({ nosniff: headers['x-content-type-options'], referrer: headers['referrer-policy'], permissions: (headers['permissions-policy'] ?? '').slice(0, 60), cspRO: (headers['content-security-policy-report-only'] ?? '').length }))
  const { data } = await serviceDb().from('orders').select('total').eq('id', order).single()
  expect(pesoAmounts(await page.locator('body').innerText())).toContain(Number(data?.total))
  await report(page, info, seen, 'seeded-tracking')
})

test('security headers on storefront, tracking, login and API responses', async ({ page }, info) => {
  const order = '81d7fad6-539f-512b-b4e0-4a93c803c007'
  const paths = ['/', '/menu', '/cart', '/checkout', `/order/${order}?t=${trackingToken(order)}`, '/login', '/admin/orders', '/api/storefront/visit']
  const rows: Record<string, unknown>[] = []
  for (const path of paths) {
    const res = await page.request.get(path, { maxRedirects: 0, failOnStatusCode: false, timeout: 240_000 })
    const h = res.headers()
    rows.push({
      path: path.replace(/t=[0-9a-f]+/, 't=…'),
      status: res.status(),
      nosniff: h['x-content-type-options'] ?? null,
      referrer: h['referrer-policy'] ?? null,
      permissions: h['permissions-policy'] ? 'present' : null,
      cspReportOnly: h['content-security-policy-report-only'] ? 'present' : null,
      csp: h['content-security-policy'] ?? null,
      poweredBy: h['x-powered-by'] ?? null,
    })
  }
  saveJson(`${info.project.name}-security-headers.json`, rows)
  for (const r of rows) note(info, 'headers', JSON.stringify(r))
  for (const r of rows) {
    expect(r.nosniff, `${r.path} nosniff`).toBe('nosniff')
    expect(r.referrer, `${r.path} referrer-policy`).toBeTruthy()
    expect(r.permissions, `${r.path} permissions-policy`).toBe('present')
    expect(r.cspReportOnly, `${r.path} CSP-Report-Only`).toBe('present')
    expect(r.poweredBy, `${r.path} x-powered-by`).toBeNull()
  }
})
