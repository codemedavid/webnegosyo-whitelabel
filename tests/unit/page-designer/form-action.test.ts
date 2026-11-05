/**
 * Saving the checkout questions from the Page Designer: `store_setup` first,
 * only this store's order types, refused when the questions changed since
 * the editor loaded them, the writes worked out on the server and run
 * through the order-type service in order (creates → updates → deletes →
 * reorders, new ids resolved), and the result checked against the database.
 * Publishing takes the form too and says so when only the form was saved.
 */

import { createWidget } from '@/lib/hero-builder/defaults'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import type { FormQuestion } from '@/lib/page-designer/form-changes'

const PICKUP = '11111111-1111-4111-8111-111111111111'
const FOREIGN = '99999999-9999-4999-8999-999999999999'

const mockVerify = jest.fn()
const mockCalls: string[] = []
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()
const mockReorder = jest.fn()
const mockTenantSingle = jest.fn()
const mockRevalidatePath = jest.fn()
let mockOrderTypes: { id: string; name: string }[] = []
let mockFieldReads: unknown[][] = []

jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args), revalidateTag: jest.fn() }))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: (...args: unknown[]) => mockVerify(...args) }))
jest.mock('@/lib/cache', () => ({ invalidateTenantCache: jest.fn() }))
jest.mock('@/lib/storefront/revalidate', () => ({ revalidateStorefrontMenu: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/branding-write', () => ({ saveBrandingWithClient: jest.fn() }))
jest.mock('@/lib/order-types-service', () => ({
  createCustomerFormField: (...args: unknown[]) => {
    mockCalls.push('create')
    return mockCreate(...args)
  },
  updateCustomerFormField: (...args: unknown[]) => {
    mockCalls.push('update')
    return mockUpdate(...args)
  },
  deleteCustomerFormField: (...args: unknown[]) => {
    mockCalls.push('delete')
    return mockDelete(...args)
  },
  reorderCustomerFormFields: (...args: unknown[]) => {
    mockCalls.push('reorder')
    return mockReorder(...args)
  },
}))
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        update: () => builder,
        order: async () => ({ data: mockFieldReads.shift() ?? [], error: null }),
        maybeSingle: async () => ({ data: { slug: 'island-silog' }, error: null }),
        single: () => mockTenantSingle(),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: table === 'order_types' ? mockOrderTypes : [], error: null }),
      }
      return builder
    },
  }),
}))

const load = () => import('@/app/actions/page-designer')

function question(id: string, overrides: Partial<FormQuestion> = {}): FormQuestion {
  return { id, field_name: id, field_label: `Label ${id}`, field_type: 'text', is_required: false, placeholder: '', options: [], validation_rules: {}, ...overrides }
}

/** A stored row for the mocked database reads. */
const row = (q: FormQuestion, index: number) => ({ ...q, order_type_id: PICKUP, order_index: index })

const NAME = question('f-name', { field_name: 'customer_name' })
const NOTES = question('f-notes', { field_name: 'notes', field_type: 'textarea' })
const NEW_ID = 'new-abc'

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockCalls.length = 0
  mockVerify.mockResolvedValue({})
  mockOrderTypes = [{ id: PICKUP, name: 'Pickup' }]
  mockFieldReads = []
  mockCreate.mockResolvedValue({ id: 'f-plate' })
  mockUpdate.mockResolvedValue({})
  mockDelete.mockResolvedValue(undefined)
  mockReorder.mockResolvedValue(undefined)
  mockTenantSingle.mockResolvedValue({ data: { id: 't1', slug: 'island-silog' }, error: null })
})

/** Rename the name, drop the notes, add a plate question first. */
const DRAFT = [question(NEW_ID, { field_name: '', field_label: 'Car plate' }), { ...NAME, field_label: 'Your name' }]
const FORM = { orderTypes: { [PICKUP]: { base: [NAME, NOTES], draft: DRAFT } } }
const STORED_AFTER = [row({ ...question('f-plate', { field_name: 'car_plate', field_label: 'Car plate' }) }, 0), row({ ...NAME, field_label: 'Your name' }, 1)]

describe('saveCheckoutFormAction', () => {
  it('refuses without store_setup and writes nothing', async () => {
    mockVerify.mockRejectedValueOnce(new Error('Forbidden: missing store_setup'))
    const result = await (await load()).saveCheckoutFormAction('t1', FORM)
    expect(result).toEqual({ success: false, error: expect.stringMatching(/Store setup access/) })
    expect(mockCalls).toEqual([])
  })

  it('refuses an order type that is not this store’s', async () => {
    const result = await (await load()).saveCheckoutFormAction('t1', { orderTypes: { [FOREIGN]: { base: [], draft: [] } } })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no longer part of your store/)
    expect(mockCalls).toEqual([])
  })

  it('refuses when the questions changed since the editor loaded them', async () => {
    mockFieldReads = [[row({ ...NAME, field_label: 'Changed elsewhere' }, 0), row(NOTES, 1)]]
    const result = await (await load()).saveCheckoutFormAction('t1', FORM)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/"Pickup" questions changed somewhere else/)
    expect(mockCalls).toEqual([])
  })

  it('refuses input it can’t read', async () => {
    const result = await (await load()).saveCheckoutFormAction('t1', { orderTypes: { [PICKUP]: { base: [], draft: [{ id: 'x', field_type: 'script' }] } } })
    expect(result).toEqual({ success: false, error: expect.stringMatching(/could not be read/) })
  })

  it('writes creates → updates → deletes → reorder through the service, new ids resolved, then checks what landed', async () => {
    mockFieldReads = [[row(NAME, 0), row(NOTES, 1)], STORED_AFTER]
    const result = await (await load()).saveCheckoutFormAction('t1', FORM)
    expect(result.success).toBe(true)
    expect(mockVerify).toHaveBeenCalledWith('t1', 'store_setup')
    expect(mockCalls).toEqual(['create', 'update', 'delete', 'reorder'])
    expect(mockCreate).toHaveBeenCalledWith('t1', PICKUP, expect.objectContaining({ field_name: 'car_plate', field_label: 'Car plate', order_index: 0 }))
    expect(mockUpdate).toHaveBeenCalledWith('f-name', 't1', expect.objectContaining({ field_name: 'customer_name', field_label: 'Your name' }))
    expect(mockDelete).toHaveBeenCalledWith('f-notes', 't1')
    expect(mockReorder).toHaveBeenCalledWith(['f-plate', 'f-name'], 't1')
    expect(result.form?.created).toEqual({ [NEW_ID]: 'f-plate' })
    expect(result.form?.fields[PICKUP].map((q) => q.id)).toEqual(['f-plate', 'f-name'])
    expect(mockRevalidatePath).toHaveBeenCalledWith('/island-silog/checkout')
  })

  it('reports a save that did not land (RLS returns no rows, no error)', async () => {
    mockFieldReads = [[row(NAME, 0), row(NOTES, 1)], [row(NAME, 0), row(NOTES, 1)]]
    const result = await (await load()).saveCheckoutFormAction('t1', FORM)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/could not be saved/)
  })

  it('stops at the first failed write', async () => {
    mockFieldReads = [[row(NAME, 0), row(NOTES, 1)]]
    mockUpdate.mockRejectedValueOnce(new Error('JSON object requested, multiple (or no) rows returned'))
    const result = await (await load()).saveCheckoutFormAction('t1', FORM)
    expect(result.success).toBe(false)
    expect(mockCalls).toEqual(['create', 'update'])
  })
})

describe('publishPageDesignAction with the form', () => {
  const design = () => {
    const d = createStandardDesign('checkout')
    return { ...d, sections: [...d.sections] }
  }

  it('saves the form, then publishes, and hands the saved questions back', async () => {
    mockFieldReads = [[row(NAME, 0), row(NOTES, 1)], STORED_AFTER]
    const result = await (await load()).publishPageDesignAction('t1', 'checkout', design(), undefined, FORM)
    expect(result.success).toBe(true)
    expect(mockCalls).toEqual(['create', 'update', 'delete', 'reorder'])
    expect(result.form?.created).toEqual({ [NEW_ID]: 'f-plate' })
  })

  it('a refused form publishes nothing', async () => {
    mockFieldReads = [[row({ ...NAME, field_label: 'Changed elsewhere' }, 0), row(NOTES, 1)]]
    const result = await (await load()).publishPageDesignAction('t1', 'checkout', design(), undefined, FORM)
    expect(result.success).toBe(false)
    expect(mockTenantSingle).not.toHaveBeenCalled()
  })

  it('says the form was saved when the page then failed to publish', async () => {
    mockFieldReads = [[row(NAME, 0), row(NOTES, 1)], STORED_AFTER]
    mockTenantSingle.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const result = await (await load()).publishPageDesignAction('t1', 'checkout', design(), undefined, FORM)
    expect(result).toEqual({ success: false, error: 'Your form was saved, but the page did not publish. Please publish again.', form: expect.anything() })
  })

  it('a refused design writes no questions', async () => {
    const bad = { ...design(), sections: [{ ...design().sections[0], columns: [{ id: 'c', widgets: [createWidget('embed')] }] }] }
    const result = await (await load()).publishPageDesignAction('t1', 'checkout', bad, undefined, FORM)
    expect(result.success).toBe(false)
    expect(mockCalls).toEqual([])
  })
})
