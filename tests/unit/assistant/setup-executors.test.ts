/** @jest-environment node */
/**
 * Confirmed set-up proposals go through the admin screens' own writers, and
 * refuse when the thing changed since the card was shown.
 */

jest.mock('server-only', () => ({}))
let mockRow: Record<string, unknown> | null = null
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: mockRow, error: null }) }
    return { from: () => chain }
  },
}))
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockTypes = jest.fn()
const mockRevalidate = jest.fn()
jest.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => mockRevalidate(...a) }))
jest.mock('@/lib/payment-methods-service', () => ({
  createPaymentMethod: (...a: unknown[]) => mockCreate(...a),
  updatePaymentMethod: (...a: unknown[]) => mockUpdate(...a),
  updatePaymentMethodOrderTypes: (...a: unknown[]) => mockTypes(...a),
}))
const mockCreateIngredient = jest.fn()
jest.mock('@/lib/inventory/ingredients-service', () => ({ createIngredient: (...a: unknown[]) => mockCreateIngredient(...a) }))
const mockMovement = jest.fn()
jest.mock('@/lib/inventory/stock-service', () => ({ recordStockMovement: (...a: unknown[]) => mockMovement(...a) }))

import { executeIngredient, executePaymentMethod, executePaymentMethodChange } from '@/lib/assistant/actions/execute-setup'

const STORE = { id: 't', slug: 's' }

beforeEach(() => {
  jest.clearAllMocks()
  mockRow = { updated_at: '2026-11-01T00:00:00Z' }
})

test('a new payment method goes through the admin writer, switched on, with its order types', async () => {
  mockCreate.mockResolvedValue({ id: 'pm-1' })
  const outcome = await executePaymentMethod(STORE, { name: 'Maya', details: '0918', qrCodeUrl: null, orderTypeIds: ['ot-1'], requireProof: true })
  expect(mockCreate).toHaveBeenCalledWith('t', 'Maya', '0918', undefined, true, ['ot-1'], true, false)
  expect(mockRevalidate).toHaveBeenCalledWith('/s/admin/payment-methods')
  expect(outcome).toMatchObject({ ok: true, resultRef: 'pm-1' })
})

test('a refused write is told plainly, never with the raw database text', async () => {
  mockCreate.mockRejectedValue(new Error('new row violates row-level security policy'))
  const outcome = await executePaymentMethod(STORE, { name: 'Maya', details: null, qrCodeUrl: null, orderTypeIds: ['ot-1'], requireProof: false })
  expect(outcome.ok).toBe(false)
  if (!outcome.ok) expect(outcome.error).not.toMatch(/row-level/)
})

const change = (over: Record<string, unknown> = {}) => ({
  paymentMethodId: 'pm-1',
  name: 'GCash',
  changes: { name: null, details: null, qrCodeUrl: null, isActive: false, requireProof: null, orderTypeIds: null, ...over },
  expectedUpdatedAt: '2026-11-01T00:00:00Z',
})

test('a change refuses when the method moved on since the card was shown', async () => {
  mockRow = { updated_at: '2026-11-05T00:00:00Z' }
  const outcome = await executePaymentMethodChange(STORE, change())
  expect(outcome.ok).toBe(false)
  expect(mockUpdate).not.toHaveBeenCalled()
})

test('a method first seen without a timestamp is stale once it has one (edited meanwhile)', async () => {
  mockRow = { updated_at: '2026-11-05T00:00:00Z' }
  const outcome = await executePaymentMethodChange(STORE, { ...change(), expectedUpdatedAt: null })
  expect(outcome.ok).toBe(false)
  expect(mockUpdate).not.toHaveBeenCalled()
})

test('saved fields + failed order types = done, with what is left to do (a retry would only be stale)', async () => {
  mockUpdate.mockResolvedValue({ id: 'pm-1' })
  mockTypes.mockRejectedValue(new Error('boom'))
  const outcome = await executePaymentMethodChange(STORE, change({ orderTypeIds: ['ot-2'] }))
  expect(outcome).toMatchObject({ ok: true })
  if (outcome.ok) expect(outcome.message).toMatch(/order types could not be changed/)
})

test('a change writes only the fields that change, then the order types', async () => {
  mockUpdate.mockResolvedValue({ id: 'pm-1' })
  mockTypes.mockResolvedValue(undefined)
  const outcome = await executePaymentMethodChange(STORE, change({ qrCodeUrl: '', orderTypeIds: ['ot-2'] }))
  expect(mockUpdate).toHaveBeenCalledWith('pm-1', 't', { qr_code_url: '', is_active: false })
  expect(mockTypes).toHaveBeenCalledWith('pm-1', 't', ['ot-2'])
  expect(outcome).toMatchObject({ ok: true })
})

test('a new ingredient starts at 0 and its opening count is a stocktake movement, never a direct quantity', async () => {
  mockCreateIngredient.mockResolvedValue({ id: 'ing-1' })
  mockMovement.mockResolvedValue({})
  const outcome = await executeIngredient(STORE, { name: 'Rice', stockUnitId: 'kg', unitLabel: 'kg', reorderLevel: 5, openingCount: 25, category: null })
  expect(mockCreateIngredient).toHaveBeenCalledWith('t', expect.objectContaining({ name: 'Rice', stock_unit_id: 'kg', reorder_level: 5, unit_cost: 0 }))
  expect(mockCreateIngredient.mock.calls[0][1]).not.toHaveProperty('current_qty')
  expect(mockMovement).toHaveBeenCalledWith('t', expect.objectContaining({ inventory_item_id: 'ing-1', reason: 'stocktake', quantity: 25, unit_id: 'kg' }))
  expect(outcome).toMatchObject({ ok: true, message: 'Rice was added with 25 kg on hand.' })
})

test('if the count is refused the ingredient is still added and the owner is told', async () => {
  mockCreateIngredient.mockResolvedValue({ id: 'ing-1' })
  mockMovement.mockRejectedValue(new Error('Recording stock needs the Inventory permission.'))
  const outcome = await executeIngredient(STORE, { name: 'Rice', stockUnitId: 'kg', unitLabel: 'kg', reorderLevel: 0, openingCount: 25, category: null })
  expect(outcome).toMatchObject({ ok: true })
  if (outcome.ok) expect(outcome.message).toMatch(/opening count was not recorded/)
})
