/**
 * The dish recipe panel against a mocked `/api/inventory/dish-recipe`: the
 * owner types what each size uses IN TOTAL, the save sends the split form
 * (shared part on the dish, the extra on each size), a recipe counted twice
 * is flagged with a one-tap fix, and a stale save asks for a reload.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DishRecipePanel } from '@/components/admin/dish-recipe/dish-recipe-panel'
import type { DishRecipes } from '@/lib/inventory/dish-recipe/model'
import { GROUPS, UNITS } from './dish-recipe-fixtures'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const INGREDIENTS = [
  { id: 'milk', name: 'Fresh milk', stock_unit_id: 'ml' },
  { id: 'cup', name: 'Cup', stock_unit_id: 'pc' },
  { id: 'cone', name: 'Cone', stock_unit_id: 'pc' },
]

function snapshot(recipes: DishRecipes, version = 'v1') {
  return { menuItemId: 'dish', dishName: 'Milk tea', groups: GROUPS, recipes, version }
}

const SIZED: DishRecipes = {
  base: [
    { inventoryItemId: 'milk', quantity: 180, unitId: 'ml' },
    { inventoryItemId: 'cup', quantity: 1, unitId: 'pc' },
  ],
  options: { small: [], medium: [{ inventoryItemId: 'milk', quantity: 40, unitId: 'ml' }], large: [{ inventoryItemId: 'milk', quantity: 70, unitId: 'ml' }] },
}

type Reply = { status?: number; body: unknown }
let replies: Reply[] = []
const fetchMock = jest.fn(async (...args: [string, RequestInit?]) => {
  void args
  const reply = replies.shift()
  if (!reply) throw new Error('unexpected fetch')
  return { ok: (reply.status ?? 200) < 400, status: reply.status ?? 200, json: async () => reply.body } as Response
})

beforeEach(() => {
  replies = []
  fetchMock.mockClear()
  global.fetch = fetchMock as unknown as typeof fetch
})

function loadReply(recipes: DishRecipes, version = 'v1'): Reply {
  return { body: { success: true, data: { ingredients: INGREDIENTS, units: UNITS, snapshot: snapshot(recipes, version) } } }
}

async function renderPanel(recipes: DishRecipes, firstRow = 'Fresh milk') {
  replies.push(loadReply(recipes))
  render(<DishRecipePanel tenantId="t1" tenantSlug="cafe" menuItemId="dish" />)
  await screen.findByText(firstRow)
}

it('shows each size its TOTAL: dish recipe + that size\'s extra', async () => {
  await renderPanel(SIZED)
  expect(screen.getByLabelText('Fresh milk, Small')).toHaveValue('180')
  expect(screen.getByLabelText('Fresh milk, Medium')).toHaveValue('220')
  expect(screen.getByLabelText('Fresh milk, Large')).toHaveValue('250')
  expect(screen.getByRole('button', { name: 'Save recipe' })).toBeDisabled()
})

it('saves a typed total as the shared part on the dish and the extra on the size', async () => {
  await renderPanel(SIZED)
  fireEvent.change(screen.getByLabelText('Fresh milk, Large'), { target: { value: '300' } })

  replies.push({ body: { success: true, data: { written: 1, snapshot: snapshot({ ...SIZED, options: { ...SIZED.options, large: [{ inventoryItemId: 'milk', quantity: 120, unitId: 'ml' }] } }, 'v2') } } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  })

  const [, init] = fetchMock.mock.calls[1]
  const body = JSON.parse(String(init?.body))
  expect(body).toMatchObject({ tenantId: 't1', tenantSlug: 'cafe', menuItemId: 'dish', version: 'v1' })
  expect(body.recipes.base).toEqual(SIZED.base)
  expect(body.recipes.options.large).toEqual([{ inventoryItemId: 'milk', quantity: 120, unitId: 'ml' }])
  expect(body.recipes.options.medium).toEqual(SIZED.options.medium)
  await waitFor(() => expect(screen.getByLabelText('Fresh milk, Large')).toHaveValue('300'))
  expect(screen.getByRole('button', { name: 'Save recipe' })).toBeDisabled()
})

it('flags an ingredient counted twice and fixes it with one tap', async () => {
  // The live Cafe Chill shape: every flavour repeats the dish's cone.
  await renderPanel({
    base: [{ inventoryItemId: 'cone', quantity: 1, unitId: 'pc' }],
    options: {
      small: [{ inventoryItemId: 'cone', quantity: 1, unitId: 'pc' }],
      medium: [{ inventoryItemId: 'cone', quantity: 1, unitId: 'pc' }],
      large: [{ inventoryItemId: 'cone', quantity: 1, unitId: 'pc' }],
    },
  }, 'Cone')
  expect(screen.getByText(/Cone is counted twice/)).toHaveTextContent('each sale takes 2 pc')
  expect(screen.getByLabelText('Cone, Large')).toHaveValue('2')

  fireEvent.click(screen.getByRole('button', { name: 'Count it once' }))

  expect(screen.queryByText(/counted twice/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Cone, Large')).toHaveValue('1')
  expect(screen.getByRole('button', { name: 'Save recipe' })).toBeEnabled()
})

it('suggests sizes when every size takes the same amounts', async () => {
  await renderPanel({ base: SIZED.base, options: {} })
  expect(screen.getByText(/Every size takes the same amounts/)).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Enter by size' }))

  expect(screen.getByLabelText('Fresh milk, Large')).toHaveValue('180')
})

it('refuses to save a row with no amount, and says which', async () => {
  await renderPanel(SIZED)
  for (const size of ['Small', 'Medium', 'Large']) {
    fireEvent.change(screen.getByLabelText(`Cup, ${size}`), { target: { value: '' } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(await screen.findByText(/Enter how much Cup each version uses/)).toBeInTheDocument()
})

it('asks for a reload when another screen saved first', async () => {
  await renderPanel(SIZED)
  fireEvent.change(screen.getByLabelText('Fresh milk, Small'), { target: { value: '190' } })
  replies.push({ status: 409, body: { success: false, code: 'stale', error: 'changed elsewhere' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
  })

  expect(screen.getByText(/Someone saved these recipes on another screen/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save recipe' })).toBeDisabled()

  replies.push(loadReply(SIZED, 'v3'))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Reload/ }))
  })
  await waitFor(() => expect(screen.queryByText(/another screen/)).not.toBeInTheDocument())
  expect(screen.getByLabelText('Fresh milk, Small')).toHaveValue('180')
})
