/** @jest-environment node */

import { NextRequest } from 'next/server'
import { DELETE, GET, PUT } from '@/app/api/inventory/recipe/route'

const verifyTenantPermission = jest.fn()
const getIngredients = jest.fn()
const getUnits = jest.fn()
const getRecipeForTarget = jest.fn()
const saveRecipeForTarget = jest.fn()
const deleteRecipeForTarget = jest.fn()
const revalidatePath = jest.fn()
const captureException = jest.fn()

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}))

jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: unknown[]) => verifyTenantPermission(...args),
}))

jest.mock('@/lib/inventory/ingredients-service', () => ({
  getIngredients: (...args: unknown[]) => getIngredients(...args),
}))

jest.mock('@/lib/inventory/units-service', () => ({
  getUnits: (...args: unknown[]) => getUnits(...args),
}))

jest.mock('@/lib/inventory/recipes-service', () => ({
  getRecipeForTarget: (...args: unknown[]) => getRecipeForTarget(...args),
  saveRecipeForTarget: (...args: unknown[]) => saveRecipeForTarget(...args),
  deleteRecipeForTarget: (...args: unknown[]) => deleteRecipeForTarget(...args),
}))

const TENANT = 'tenant-1'
const TARGET = { type: 'menu_item', menuItemId: 'menu-1' }

function getRequest() {
  const url = new URL('http://localhost/api/inventory/recipe')
  url.searchParams.set('tenantId', TENANT)
  url.searchParams.set('target', JSON.stringify(TARGET))
  return new NextRequest(url)
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  verifyTenantPermission.mockResolvedValue({ user: { id: 'user-1' } })
  getIngredients.mockResolvedValue([{ id: 'ingredient-1' }])
  getUnits.mockResolvedValue([{ id: 'unit-1' }])
  getRecipeForTarget.mockResolvedValue({ recipe: { id: 'recipe-1' }, components: [] })
  saveRecipeForTarget.mockResolvedValue({ recipe: { id: 'recipe-1' }, components: [] })
  deleteRecipeForTarget.mockResolvedValue(undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('PUT /api/inventory/recipe', () => {
  it('persists a recipe through the authenticated HTTP boundary', async () => {
    const input = {
      notes: null,
      components: [{
        inventory_item_id: '11111111-1111-4111-8111-111111111111',
        quantity: 2,
        unit_id: '22222222-2222-4222-8222-222222222222',
      }],
    }
    const response = await PUT(new NextRequest('http://localhost/api/inventory/recipe', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ tenantId: TENANT, tenantSlug: 'shop', target: TARGET, input }),
    }))

    expect({ status: response.status, body: await response.clone().json() }).toEqual({
      status: 200,
      body: expect.objectContaining({ success: true }),
    })
    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'menu')
    expect(saveRecipeForTarget).toHaveBeenCalledWith(TENANT, TARGET, input)
  })

  it('rejects a cross-origin write before authorization or persistence', async () => {
    const response = await PUT(new NextRequest('http://localhost/api/inventory/recipe', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
      body: JSON.stringify({
        tenantId: TENANT,
        tenantSlug: 'shop',
        target: TARGET,
        input: { notes: null, components: [] },
      }),
    }))

    expect(response.status).toBe(403)
    expect(verifyTenantPermission).not.toHaveBeenCalled()
    expect(saveRecipeForTarget).not.toHaveBeenCalled()
  })

  it('rejects a tenant slug that could escape the scoped revalidation path', async () => {
    const response = await PUT(new NextRequest('http://localhost/api/inventory/recipe', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({
        tenantId: TENANT,
        tenantSlug: '../admin',
        target: TARGET,
        input: { notes: null, components: [] },
      }),
    }))

    expect(response.status).toBe(400)
    expect(saveRecipeForTarget).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/inventory/recipe', () => {
  it('clears a recipe through the same authenticated, origin-checked boundary', async () => {
    const response = await DELETE(new NextRequest('http://localhost/api/inventory/recipe', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ tenantId: TENANT, tenantSlug: 'shop', target: TARGET }),
    }))

    expect(response.status).toBe(200)
    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'menu')
    expect(deleteRecipeForTarget).toHaveBeenCalledWith(TENANT, TARGET)
  })
})

describe('GET /api/inventory/recipe', () => {
  it('authorizes once and returns the complete recipe editor snapshot', async () => {
    const response = await GET(getRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'menu')
    expect(getIngredients).toHaveBeenCalledWith(TENANT)
    expect(getUnits).toHaveBeenCalledWith(TENANT)
    expect(getRecipeForTarget).toHaveBeenCalledWith(TENANT, TARGET)
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        ingredients: [{ id: 'ingredient-1' }],
        units: [{ id: 'unit-1' }],
        recipe: { recipe: { id: 'recipe-1' }, components: [] },
      },
    })
  })

  it('reports an unexpected backend failure without attaching the request payload', async () => {
    const error = new Error('database unavailable')
    getIngredients.mockRejectedValue(error)

    const response = await GET(getRequest())

    expect(response.status).toBe(500)
    expect(captureException).toHaveBeenCalledWith(error, {
      tags: {
        area: 'inventory_recipe',
        operation: 'read',
        tenantId: TENANT,
      },
    })
  })

  it('does not report malformed input as an unexpected server failure', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/inventory/recipe?tenantId=tenant-1&target=not-json',
    ))

    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(captureException).not.toHaveBeenCalled()
  })
})
