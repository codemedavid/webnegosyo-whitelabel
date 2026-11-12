/**
 * Messenger Studio on sample-demo (/admin/settings/messenger/automations).
 *
 * desktop: Journey → Auto-replies (toggle counts as a change, undo clears it; a recipe opens the editor)
 * → Messages (Taglish swaps the default words; edit "After adding a dish" → the preview phone shows it)
 * → Save (ONLY the words: saving rules would sync sample-demo's real Facebook Page profile) → the stored
 * row holds the edit → reload keeps it → Test chat runs the draft words on a real tap path → Reset all +
 * Save. phone: screenshots of the same screens, nothing saved.
 *
 * sample-demo had NO messenger_settings row before this spec; the caller deletes the row it creates.
 */
import { expect, test, type Page } from '@playwright/test'

import { adminSessionCookies } from '../../../../tests/e2e/admin-session'
import { ADMIN_EMAIL, liftHold, note, report, restoreHold, saveJson, serviceDb, settle, shot, SLUG, TENANT_ID, watch } from './lib'

const PATH = '/admin/settings/messenger/automations'
// Different every run, so it is a change even if an earlier run left its words behind.
const CUSTOM = `Sige! {item} is in. Cart: {count} · {total} #${Date.now() % 10_000}`

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => { console.log(await liftHold()) })
test.afterAll(async () => { console.log(await restoreHold()) })
test.beforeEach(async ({ context }) => {
  await context.addCookies(await adminSessionCookies(ADMIN_EMAIL, `${SLUG}.localhost`))
})

const rail = (page: Page, name: string) => page.locator('nav[aria-label="Screens"]').getByRole('button', { name })
const phone = (page: Page) => page.locator('main[aria-label="Preview"]')

async function storedMessages() {
  const { data, error } = await serviceDb().from('messenger_settings').select('messages, order_updates, bot_enabled').eq('tenant_id', TENANT_ID).maybeSingle()
  if (error) throw error
  return data
}

async function open(page: Page) {
  const res = await page.goto(PATH, { waitUntil: 'domcontentloaded' })
  await settle(page, 4000)
  expect(res?.url() ?? '').not.toMatch(/subscription|login/)
  await expect(page.locator('nav[aria-label="Screens"]')).toBeVisible({ timeout: 120_000 })
}

test('messenger studio: journey, auto-replies, messages, save, test chat', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop drives and saves; phone only looks')
  const seen = watch(page)
  const before = await storedMessages()
  saveJson('messenger-settings-before.json', before)
  note(info, 'db-before', `messenger_settings row before: ${before ? JSON.stringify(before.messages) : 'none'}`)

  await open(page)
  await expect(page.getByRole('heading', { name: 'Messenger Studio' })).toBeVisible()
  await expect(page.getByText(/\d+ changes?$/)).toHaveCount(0)
  await shot(page, info, 'm1-journey')

  // Auto-replies: a toggle is a change; toggling back clears it. Nothing saved here.
  await rail(page, 'Auto-replies').click()
  await expect(page.getByRole('list', { name: 'Automations, checked from the top' })).toBeVisible()
  const firstSwitch = page.getByRole('list', { name: 'Automations, checked from the top' }).getByRole('switch').first()
  await firstSwitch.click()
  await expect(page.getByText('1 change')).toBeVisible()
  await shot(page, info, 'm2-rules-toggled')
  await firstSwitch.click()
  await expect(page.getByText(/\d+ changes?$/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Add' }).click()
  await page.locator('section[aria-labelledby="recipes-title"] button').first().click()
  await page.waitForTimeout(800)
  await shot(page, info, 'm3-recipe-editor')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await expect(page.getByText(/\d+ changes?$/)).toHaveCount(0)

  // Messages: Taglish swaps the grey default words.
  await rail(page, 'Messages').click()
  // An earlier, interrupted run may have left its words: put them back through the UI first.
  if (await page.getByRole('button', { name: 'Reset all' }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Reset all' }).click()
    await page.getByRole('button', { name: 'Tap again to reset all' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(/Saved\. Your Page/).last()).toBeVisible({ timeout: 60_000 })
    note(info, 'reset-leftover', 'an earlier run left custom words; reset them before starting')
  }
  await page.getByRole('radio', { name: 'Cart', exact: true }).click()
  const added = page.getByRole('button', { name: /After adding a dish/ })
  await expect(added).toContainText('Your cart')
  await page.getByRole('radio', { name: 'Taglish' }).click()
  await expect(added).toContainText('Cart mo')
  await shot(page, info, 'm4-messages-taglish')
  await page.getByRole('radio', { name: 'English' }).click()
  await expect(page.getByText(/\d+ changes?$/)).toHaveCount(0)

  // Edit the cart line and watch the preview phone.
  await added.click()
  const box = page.locator('textarea, input[type="text"]').filter({ visible: true }).first()
  await box.fill(CUSTOM)
  await expect(page.getByText('1 change')).toBeVisible()
  await expect(phone(page).getByText(/^Sige! /).first()).toBeVisible()
  await shot(page, info, 'm5-messages-edited')

  // Save (words only) → DB.
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/Saved\. Your Page/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/\d+ changes?$/)).toHaveCount(0)
  const after = await storedMessages()
  saveJson('messenger-settings-after-save.json', after)
  const stored = (after?.messages ?? {}) as Record<string, unknown>
  note(info, 'db-after-save', JSON.stringify(after?.messages))
  expect(stored['cart.added']).toBe(CUSTOM)
  expect(Object.keys(stored).filter((key) => key !== 'lang')).toEqual(['cart.added'])

  // Reload keeps it.
  await open(page)
  await rail(page, 'Messages').click()
  await page.getByRole('radio', { name: 'Cart', exact: true }).click()
  await expect(page.getByRole('button', { name: /After adding a dish/ })).toContainText('Sige!')
  await shot(page, info, 'm6-reloaded')

  // Test chat: menu → categories → a category → Add to cart → our words.
  await page.getByRole('tab', { name: 'Test chat' }).click()
  await phone(page).getByRole('button', { name: 'magkano po?' }).click()
  await page.waitForTimeout(500)
  await shot(page, info, 'm7-testchat-prices')
  const answered = await phone(page).getByText(/^Answered by #/).first().innerText().catch(() => '(no rule label)')
  note(info, 'testchat-prices', answered)
  await phone(page).getByRole('textbox', { name: 'Type like a customer' }).fill('menu')
  await phone(page).getByRole('button', { name: 'Send' }).click()
  await page.waitForTimeout(500)
  const categories = phone(page).getByRole('button', { name: /Categories/ }).last()
  if (await categories.isVisible().catch(() => false)) {
    await categories.click()
    await page.waitForTimeout(500)
    // The first category quick reply (the last one is "Full menu").
    const reply = phone(page).locator('button.rounded-full.border').filter({ hasNotText: /Full menu|Start over/ }).first()
    await reply.click().catch(() => {})
    await page.waitForTimeout(500)
  }
  await shot(page, info, 'm8-testchat-browse')
  const addToCart = phone(page).getByRole('button', { name: /Add to cart/ }).first()
  await expect(addToCart).toBeVisible()
  await addToCart.click()
  await expect(phone(page).getByText(/^Sige! .+ is in\. Cart: /).first()).toBeVisible()
  await shot(page, info, 'm9-testchat-added')

  // Settings tab.
  await rail(page, 'Settings & test').click()
  await expect(page.getByText('Bot answers by itself').first()).toBeVisible()
  await shot(page, info, 'm10-settings')

  // Reset all + Save → nothing customised stays.
  await rail(page, 'Messages').click()
  await page.getByRole('button', { name: 'Reset all' }).click()
  await page.getByRole('button', { name: 'Tap again to reset all' }).click()
  await expect(page.getByText('1 change')).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/Saved\. Your Page/).last()).toBeVisible({ timeout: 60_000 })
  const reset = await storedMessages()
  saveJson('messenger-settings-after-reset.json', reset)
  note(info, 'db-after-reset', JSON.stringify(reset?.messages))
  const resetKeys = Object.keys((reset?.messages ?? {}) as Record<string, unknown>).filter((key) => key !== 'lang')
  expect(resetKeys).toEqual([])
  await report(page, info, seen, 'messenger-studio')
})

// Plan A5. Nothing saved: the draft rule is thrown away with the page.
test('messenger studio: only when the store is closed', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop drives')
  const seen = watch(page)
  await open(page)
  await rail(page, 'Auto-replies').click()
  await page.getByRole('button', { name: 'Add' }).click()
  await page.locator('section[aria-labelledby="recipes-title"] button').filter({ hasText: 'Payment methods' }).click()
  const editor = page.getByRole('dialog')
  await expect(editor.getByRole('radiogroup', { name: 'Only when' })).toBeVisible()
  await editor.getByRole('radio', { name: 'Store closed' }).click()
  await expect(editor.getByRole('radio', { name: 'Store closed' })).toHaveAttribute('aria-checked', 'true')
  await page.waitForTimeout(300) // the chips' colour transition
  await shot(page, info, 'h1-editor-only-when')
  await editor.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Only when closed').first()).toBeVisible()
  await expect(page.getByText('1 change')).toBeVisible()
  await shot(page, info, 'h2-rule-card')

  await page.getByRole('tab', { name: 'Test chat' }).click()
  const pretend = page.getByRole('radiogroup', { name: 'Pretend the store is' })
  await expect(pretend).toBeVisible()
  const ask = async () => {
    await phone(page).getByRole('textbox', { name: 'Type like a customer' }).fill('gcash ok?')
    await phone(page).getByRole('button', { name: 'Send' }).click()
    await page.waitForTimeout(400)
  }
  await pretend.getByRole('radio', { name: 'Store closed' }).click()
  await ask()
  await expect(phone(page).getByText(/^Answered by #\d+ Payment methods/).last()).toBeVisible()
  await expect(phone(page).getByText(/We accept GCash/).last()).toBeVisible()
  await shot(page, info, 'h3-testchat-closed')
  note(info, 'only-when-closed', await phone(page).getByText(/^Answered by #/).last().innerText())

  await pretend.getByRole('radio', { name: 'Store open' }).click()
  await phone(page).getByRole('button', { name: 'Start over' }).click()
  await ask()
  await expect(phone(page).getByText(/Payment methods/)).toHaveCount(0)
  await expect(phone(page).getByText(/We accept GCash/)).toHaveCount(0)
  await shot(page, info, 'h4-testchat-open')
  note(info, 'only-when-open', (await phone(page).locator('p').allInnerTexts()).filter((line) => /Answered|No automation/.test(line)).join(' | ') || 'no rule answered')
  await report(page, info, seen, 'messenger-studio-hours')
})

test('messenger studio: phone layout', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone screenshots')
  const seen = watch(page)
  await open(page)
  await shot(page, info, 'm1-journey')
  await rail(page, 'Auto-replies').click()
  await page.waitForTimeout(600)
  await shot(page, info, 'm2-rules')
  await rail(page, 'Messages').click()
  await page.getByRole('radio', { name: 'Cart', exact: true }).click()
  await page.waitForTimeout(600)
  await shot(page, info, 'm4-messages')
  await page.getByRole('tab', { name: 'Test chat' }).click()
  await page.waitForTimeout(600)
  await shot(page, info, 'm7-testchat')
  await report(page, info, seen, 'messenger-studio-phone')
})
