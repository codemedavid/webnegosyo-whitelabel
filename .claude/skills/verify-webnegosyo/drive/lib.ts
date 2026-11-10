/**
 * Shared pieces for the verify-webnegosyo drive specs. sample-demo ONLY.
 */
import { execFileSync } from 'child_process'
import { createHmac } from 'crypto'
import { appendFileSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { expect, type Page, type Request, type TestInfo } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

export const SLUG = 'sample-demo'
export const TENANT_ID = '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'
export const ORDER_TYPES = { dine_in: '8fa725cc-5785-4382-9614-952407d0554e', pickup: '3f98dbe0-23c9-40c1-af0f-1114a8d5c6ff', delivery: 'fbcddf28-906a-4b7b-a157-34cf6d3a1be6' }
export const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL ?? 'admin@sampledemowebnegosyo.com'
export const PORT = process.env.QA_PORT ?? '3100'
export const EVIDENCE = process.env.EVIDENCE as string
export const SHOTS = join(EVIDENCE, 'shots')
export const STATE = process.env.VERIFY_STATE_DIR ?? join(process.env.TMPDIR ?? '/tmp', `verify-webnegosyo-${PORT}`)
const BIN = join(__dirname, '..', 'bin')
const NOISE = [/Download the React DevTools/, /\[Fast Refresh\]/, /\[HMR\]/, /favicon/, /_next\/webpack-hmr/, /sentry/i, /posthog/i, /facebook\.(com|net)/, /Tanstack/i]
mkdirSync(SHOTS, { recursive: true })

export function serviceDb() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  return db
}

/** Run the skill's DB helper (the only writer: hold lift/restore, question require/restore). */
export function dbHelper(...args: string[]): string {
  return execFileSync('node', [join(BIN, 'db.mjs'), ...args], { encoding: 'utf8', cwd: process.cwd() })
}

export function trackingToken(orderId: string): string {
  return createHmac('sha256', process.env.API_SECRET!).update(orderId).digest('hex')
}

export interface Watch {
  problems: string[]
  policy: string[]
  actions: CapturedAction[]
}

export interface CapturedAction {
  url: string
  actionId: string
  headers: Record<string, string>
  body: string
  args: unknown[] | null
  status?: number
}

/** Console errors, page errors, failed/4xx-5xx requests, CSP/Permissions-Policy reports, server-action POSTs. */
export function watch(page: Page): Watch {
  const seen: Watch = { problems: [], policy: [], actions: [] }
  const keep = (text: string) => !NOISE.some((p) => p.test(text))
  page.on('console', (m) => {
    const text = m.text()
    if (/Content Security Policy|Content-Security-Policy|Permissions[- ]Policy|Refused to|\[Report Only\]/i.test(text)) seen.policy.push(`${m.type()}: ${text.slice(0, 400)}`)
    else if (m.type() === 'error' && keep(text)) seen.problems.push(`console: ${text.slice(0, 300)}`)
  })
  page.on('pageerror', (e) => seen.problems.push(`pageerror: ${e.message.slice(0, 300)}`))
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? ''
    if (keep(r.url()) && !/ERR_ABORTED/.test(f)) seen.problems.push(`requestfailed: ${r.method()} ${r.url().slice(0, 160)} ${f}`)
  })
  page.on('response', (res) => {
    if (res.status() >= 400 && keep(res.url())) seen.problems.push(`http ${res.status()}: ${res.request().method()} ${res.url().slice(0, 160)}`)
    const req = res.request()
    const id = req.headers()['next-action']
    if (req.method() === 'POST' && id) {
      const cap = seen.actions.find((a) => a.body === req.postData() && a.actionId === id)
      if (cap) cap.status = res.status()
    }
  })
  page.on('request', (req: Request) => {
    const id = req.headers()['next-action']
    if (req.method() !== 'POST' || !id) return
    const body = req.postData() ?? ''
    let args: unknown[] | null = null
    try { args = JSON.parse(body) } catch { args = null }
    seen.actions.push({ url: req.url(), actionId: id, headers: req.headers(), body, args })
  })
  // securitypolicyviolation events (Report-Only CSP fires these too), collected in the page.
  void page.addInitScript(() => {
    ;(window as unknown as { __cspv: string[] }).__cspv = []
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(window as unknown as { __cspv: string[] }).__cspv.push(`${e.disposition} ${e.effectiveDirective} ${e.blockedURI}`.slice(0, 300))
    })
  })
  return seen
}

export async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __cspv?: string[] }).__cspv ?? []).catch(() => [])
}

/** One line per finding, appended to <evidence>/findings.jsonl and echoed. */
export function note(info: TestInfo, type: string, description: string) {
  info.annotations.push({ type, description })
  const line = { at: new Date().toISOString(), project: info.project.name, test: info.title, type, description }
  appendFileSync(join(EVIDENCE, 'findings.jsonl'), `${JSON.stringify(line)}\n`)
  console.log(`[${info.project.name}] ${type}: ${description}`)
}

export async function shot(page: Page, info: TestInfo, name: string, fullPage = false): Promise<string> {
  const file = join(SHOTS, `${info.project.name}-${name}.png`)
  await page.screenshot({ path: file, fullPage })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0)
  if (overflow > 1) note(info, 'overflow', `${name}: page is ${overflow}px wider than the viewport`)
  return file
}

export async function report(page: Page, info: TestInfo, seen: Watch, label = 'page') {
  for (const p of [...new Set(seen.problems)]) note(info, `browser-error(${label})`, p)
  for (const p of [...new Set(seen.policy)]) note(info, `policy-console(${label})`, p)
  for (const v of [...new Set(await cspViolations(page))]) note(info, `csp-violation(${label})`, v)
}

export function saveJson(name: string, value: unknown) {
  writeFileSync(join(EVIDENCE, name), JSON.stringify(value, null, 2))
}

export async function settle(page: Page, ms = 1500) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(ms)
}

async function closeItemSheet(page: Page) {
  const back = page.getByRole('button', { name: 'Go back' })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.waitForTimeout(800)
}

/** Menu → QA Fries ×2 (+ QA Chicken Inasal Large when withInasal) → cart → checkout. */
export async function fillCartToCheckout(page: Page, info: TestInfo, prefix: string, withInasal = false) {
  await page.goto('/menu', { waitUntil: 'domcontentloaded' })
  await settle(page, 4000)
  await shot(page, info, `${prefix}-menu`)
  if (withInasal) {
    await page.getByText('QA Chicken Inasal').first().click()
    await page.getByRole('button', { name: /^Large/ }).click()
    await page.getByRole('button', { name: 'Add To Cart' }).click()
    await page.waitForTimeout(1500)
    await closeItemSheet(page)
  }
  // Under load the first tap can land before hydration; tap again once if the sheet didn't open.
  const increase = page.getByRole('button', { name: 'Increase quantity', exact: true })
  await page.getByRole('button', { name: 'Add QA Fries' }).click()
  if (!(await increase.isVisible({ timeout: 15_000 }).catch(() => false))) await page.getByRole('button', { name: 'Add QA Fries' }).click()
  await increase.click()
  await page.getByRole('button', { name: 'Add To Cart' }).click()
  await page.waitForTimeout(1500)
  await closeItemSheet(page)
  await page.goto('/cart', { waitUntil: 'domcontentloaded' })
  await settle(page, 3000)
  await expect(page.getByText('QA Fries').first()).toBeVisible()
  await shot(page, info, `${prefix}-cart`)
  await page.getByRole('button', { name: 'Proceed to Checkout' }).click()
  await page.waitForURL('**/checkout', { timeout: 120_000 })
  await settle(page, 6000)
}

/** Dine-in answers that satisfy every store question (name + table); qa_birthday left as asked. */
export async function fillDineIn(page: Page, guest: string, tickBirthday: boolean) {
  await page.getByRole('button', { name: 'Dine In', exact: true }).click()
  await page.getByPlaceholder('Enter your name').fill(guest)
  await page.getByPlaceholder('Enter table number').fill('QA 9')
  if (tickBirthday) await page.getByText('Someone’s birthday today (QA)').click()
}

export async function chooseCashAndSubmit(page: Page) {
  await page.getByText('PAY AS YOU ORDER').click()
  await page.getByRole('button', { name: /^(Proceed to Payment|Complete Order|Send Order via Messenger)/ }).click()
  await page.waitForTimeout(3000)
  const finalButton = page.getByRole('button', { name: /^(Complete Order|Order Now|Place order|Confirm order|Submit order)/i }).last()
  if (await finalButton.isVisible().catch(() => false)) await finalButton.click()
}

/** All peso amounts in the visible text after a label, e.g. moneyAfter(text, /Total/). */
export function pesoAmounts(text: string): number[] {
  return [...text.matchAll(/₱\s?([\d,]+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1].replace(/,/g, '')))
}

export async function qaOrderIds(): Promise<string[]> {
  const { data } = await serviceDb().from('orders').select('id').eq('tenant_id', TENANT_ID).like('customer_name', 'QA-SEED%')
  return (data ?? []).map((r) => r.id as string)
}

/** Replay a captured server action from inside the page (same origin, same headers the browser sent). */
export async function replayAction(page: Page, cap: CapturedAction, args: unknown[]): Promise<{ status: number; text: string }> {
  const headers = Object.fromEntries(
    Object.entries(cap.headers).filter(([k]) => ['next-action', 'next-router-state-tree', 'content-type', 'accept'].includes(k)),
  )
  return page.evaluate(
    async ({ url, headers, body }) => {
      const res = await fetch(url, { method: 'POST', headers, body })
      return { status: res.status, text: await res.text() }
    },
    { url: cap.url, headers, body: JSON.stringify(args) },
  )
}

export async function liftHold() {
  return dbHelper('hold', 'lift', join(STATE, 'hold.json'))
}
export async function restoreHold() {
  return dbHelper('hold', 'restore', join(STATE, 'hold.json'))
}
