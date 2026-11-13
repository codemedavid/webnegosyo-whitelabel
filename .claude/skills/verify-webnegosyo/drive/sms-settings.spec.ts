/**
 * Settings → Text messages (SMS) on sample-demo: the section is listed, the card reads the live
 * status, and a throwaway key Semaphore refuses is NOT stored (tenant_secrets row unchanged).
 * Never enters a real key and never presses Remove (sample-demo has no key; a real one is the owner's).
 */
import { expect, test } from '@playwright/test'

import { adminSessionCookies } from '../../../../tests/e2e/admin-session'
import { ADMIN_EMAIL, liftHold, note, report, restoreHold, saveJson, serviceDb, settle, shot, SLUG, TENANT_ID, watch } from './lib'

const THROWAWAY_KEY = 'qa0000000000000000000000000invalid'

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

async function secretsRow() {
  const { data, error } = await serviceDb().from('tenant_secrets').select('semaphore_api_key, semaphore_sender_name, updated_at').eq('tenant_id', TENANT_ID).maybeSingle()
  if (error) throw new Error(error.message)
  const row = data as { semaphore_api_key: string | null; semaphore_sender_name: string | null; updated_at: string } | null
  return { hasKey: Boolean(row?.semaphore_api_key), senderName: row?.semaphore_sender_name ?? null, updatedAt: row?.updated_at ?? null }
}

test('settings lists Text messages and the card shows the live status', async ({ page }, info) => {
  const seen = watch(page)
  await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' })
  await settle(page, 5000)
  await expect(page.getByText('Text messages (SMS)').first()).toBeVisible()
  await shot(page, info, 's1-settings-overview', true)

  await page.goto('/admin/settings/sms', { waitUntil: 'domcontentloaded' })
  await settle(page, 5000)
  await expect(page.getByRole('heading', { name: 'Semaphore account' })).toBeVisible()
  const before = await secretsRow()
  saveJson(`sms-${info.project.name}-before.json`, before)
  await expect(page.getByText(before.hasKey ? /● Semaphore is on/ : '○ Semaphore is off')).toBeVisible()
  await expect(page.getByText(/gateway phone is online/)).toBeVisible()
  await shot(page, info, 's2-sms-card', true)
  note(info, 'db-read', `tenant_secrets before: hasKey=${before.hasKey}`)
  await report(page, info, seen, 'sms')
})

test('a key Semaphore refuses is refused on screen and nothing is stored', async ({ page }, info) => {
  const before = await secretsRow()
  test.skip(before.hasKey, 'sample-demo has a key: never touch it')
  const seen = watch(page)
  await page.goto('/admin/settings/sms', { waitUntil: 'domcontentloaded' })
  await settle(page, 5000)

  await page.getByLabel('Sender name (optional)').fill('BAD NAME!')
  await expect(page.getByText(/up to 11 letters or digits/)).toBeVisible()
  await page.getByLabel('Semaphore API key').fill(THROWAWAY_KEY)
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  await page.getByLabel('Sender name (optional)').fill('')

  const reply = page.waitForResponse((res) => res.url().endsWith('/api/loyalty/sms-settings') && res.request().postData()?.includes('save_fallback') === true)
  await page.getByRole('button', { name: 'Save' }).click()
  const res = await reply
  const body = await res.json().catch(() => null)
  saveJson(`sms-${info.project.name}-save-reply.json`, { status: res.status(), body })
  await expect(page.locator('section[aria-labelledby="sms-settings-title"] [role="alert"]')).toBeVisible()
  await shot(page, info, 's3-sms-refused', true)
  const shown = await page.locator('section[aria-labelledby="sms-settings-title"] [role="alert"]').innerText()

  const after = await secretsRow()
  saveJson(`sms-${info.project.name}-after.json`, after)
  note(info, 'verdict', `save reply ${res.status()} "${shown}"; tenant_secrets hasKey ${before.hasKey}→${after.hasKey}, updated_at ${before.updatedAt}→${after.updatedAt}`)
  expect([400, 503]).toContain(res.status())
  expect(after).toEqual(before)
  await expect(page.getByText('○ Semaphore is off')).toBeVisible()
  // The refused key is not echoed anywhere on the page.
  expect(await page.locator('body').innerText()).not.toContain(THROWAWAY_KEY)
  await report(page, info, seen, 'sms-refused')
})
