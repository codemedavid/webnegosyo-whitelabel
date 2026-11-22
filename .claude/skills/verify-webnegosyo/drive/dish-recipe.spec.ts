/**
 * Dish recipes by size (docs/plans/2026-11-21-dish-recipes-by-size.md) on sample-demo's
 * "QA Iced Coffee" (legacy sizes 12 oz / 16 oz): the owner types what each size uses IN TOTAL
 * in the dish editor; the database holds the shared part on the dish and the extra on the size;
 * Inventory → Recipes shows the same totals (phone: version tabs).
 *
 * The dish must start with no recipes (the spec refuses otherwise) and its recipes are removed
 * again in afterAll, so the store is left as found. The phone check reads what the desktop test
 * wrote, so run desktop with DISH_RECIPE_KEEP=1, then phone with DISH_RECIPE_CLEANUP=1.
 */
import { expect, test, type Page } from '@playwright/test'

import { adminSessionCookies } from '../../../../tests/e2e/admin-session'
import { ADMIN_EMAIL, liftHold, note, report, restoreHold, saveJson, serviceDb, settle, shot, SLUG, TENANT_ID, watch } from './lib'

const DISH = 'bb917c96-69fe-5010-8b28-d593543c1158'
const SMALL = 'qa-var-12oz'
const LARGE = 'qa-var-16oz'

test.describe.configure({ mode: 'serial' })

async function dishRecipes() {
  const { data: recipes } = await serviceDb()
    .from('recipes')
    .select('id, target_type, variation_option_id, modifier_option_id')
    .eq('tenant_id', TENANT_ID)
    .eq('menu_item_id', DISH)
    .neq('target_type', 'prep_item')
  const ids = (recipes ?? []).map((recipe) => recipe.id)
  const { data: lines } = ids.length
    ? await serviceDb().from('recipe_components').select('recipe_id, inventory_item_id, quantity, unit_id').in('recipe_id', ids)
    : { data: [] }
  return (recipes ?? []).map((recipe) => ({ ...recipe, lines: (lines ?? []).filter((line) => line.recipe_id === recipe.id) }))
}

async function cheese() {
  const { data } = await serviceDb().from('inventory_items').select('id, stock_unit_id').eq('tenant_id', TENANT_ID).eq('name', 'Cheese').single()
  return data as { id: string; stock_unit_id: string }
}

let createdHere = false

test.beforeAll(async () => {
  console.log(await liftHold())
})
test.afterAll(async () => {
  const shouldClean = (createdHere && process.env.DISH_RECIPE_KEEP !== '1') || process.env.DISH_RECIPE_CLEANUP === '1'
  if (shouldClean) {
    const ids = (await dishRecipes()).map((recipe) => recipe.id)
    if (ids.length) await serviceDb().from('recipes').delete().eq('tenant_id', TENANT_ID).in('id', ids)
    console.log(`removed ${ids.length} test recipe(s) from QA Iced Coffee`)
  }
  console.log(await restoreHold())
})
test.beforeEach(async ({ context }) => {
  await context.addCookies(await adminSessionCookies(ADMIN_EMAIL, `${SLUG}.localhost`))
})

async function openIngredients(page: Page) {
  await page.goto(`/admin/menu/${DISH}`, { waitUntil: 'domcontentloaded' })
  await settle(page, 6000)
  await page.getByRole('button', { name: /^Ingredients/ }).click()
  await expect(page.getByText('Amounts change by')).toBeVisible({ timeout: 60_000 })
}

test('dish editor: totals per size save as dish recipe + the size\'s extra', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'writes once, from the desktop project')
  expect(await dishRecipes(), 'QA Iced Coffee must start without recipes').toEqual([])
  const seen = watch(page)
  await openIngredients(page)
  await shot(page, info, 'd1-ingredients-open', true)

  await page.getByLabel('Amounts change by').click()
  await page.getByRole('option', { name: 'Options' }).click()
  await page.getByRole('combobox', { name: 'Add ingredient' }).click()
  await page.getByRole('option', { name: 'Cheese' }).click()
  await page.getByLabel('Cheese, 12 oz').fill('10')
  await page.getByLabel('Cheese, 16 oz').fill('15')
  await shot(page, info, 'd2-typed-totals', true)

  await page.getByRole('button', { name: 'Save recipe' }).click()
  createdHere = true
  await expect(page.getByText('Recipe saved')).toBeVisible()
  await shot(page, info, 'd3-saved', true)

  const stored = await dishRecipes()
  saveJson('dish-recipe-stored.json', stored)
  const { id: cheeseId, stock_unit_id: gram } = await cheese()
  const linesOf = (pick: (recipe: (typeof stored)[number]) => boolean) =>
    stored.filter(pick).flatMap((recipe) => recipe.lines.map((line) => ({ item: line.inventory_item_id, qty: Number(line.quantity), unit: line.unit_id })))
  expect(linesOf((recipe) => recipe.target_type === 'menu_item')).toEqual([{ item: cheeseId, qty: 10, unit: gram }])
  expect(linesOf((recipe) => recipe.variation_option_id === LARGE)).toEqual([{ item: cheeseId, qty: 5, unit: gram }])
  expect(stored.some((recipe) => recipe.variation_option_id === SMALL)).toBe(false)
  note(info, 'db', `dish recipe Cheese 10 g, 16 oz extra 5 g (${stored.length} recipe rows)`)

  // Reload: the editor reads the stored split back as the totals typed.
  await openIngredients(page)
  await expect(page.getByLabel('Cheese, 12 oz')).toHaveValue('10')
  await expect(page.getByLabel('Cheese, 16 oz')).toHaveValue('15')
  await expect(page.getByRole('button', { name: 'Save recipe' })).toBeDisabled()
  await shot(page, info, 'd4-reloaded', true)
  await report(page, info, seen, 'dish-editor')
})

test('Inventory → Recipes shows the same totals (phone: one size per tab)', async ({ page }, info) => {
  const seen = watch(page)
  await page.goto('/admin/inventory?tab=recipes', { waitUntil: 'domcontentloaded' })
  await settle(page, 6000)
  await page.getByTestId(`dish-${DISH}`).click()
  await expect(page.getByLabel('Cheese, 16 oz')).toHaveValue('15', { timeout: 60_000 })
  await shot(page, info, 'w1-workbench', true)
  if (info.project.name === 'phone') {
    // One size at a time: the first is open, the other waits behind its tab.
    await expect(page.getByLabel('Cheese, 12 oz')).toBeVisible()
    await expect(page.getByLabel('Cheese, 12 oz')).toHaveValue('10')
    await expect(page.getByLabel('Cheese, 16 oz')).toBeHidden()
    await page.getByRole('tab', { name: /16 oz/ }).click()
    await expect(page.getByLabel('Cheese, 16 oz')).toBeVisible()
    await expect(page.getByLabel('Cheese, 12 oz')).toBeHidden()
    await shot(page, info, 'w2-phone-tab-16oz', true)
  } else {
    await expect(page.getByLabel('Cheese, 12 oz')).toHaveValue('10')
  }
  await report(page, info, seen, 'workbench')
})
