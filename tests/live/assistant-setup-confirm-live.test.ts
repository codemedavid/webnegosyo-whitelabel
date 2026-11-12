/** @jest-environment node */
/**
 * LIVE: Owl's set-up proposals CONFIRMED against the real platform database,
 * on the designated test store only, through the same executors the Confirm
 * tap runs. Only the session check is stubbed (no browser): the writers run
 * as the service role. Everything created is deleted afterwards; no stock
 * movement is written (the ledger is append-only).
 *
 *   ASSISTANT_SETUP_LIVE=1 npx jest tests/live/assistant-setup-confirm-live.test.ts
 */
import fs from 'fs'
import path from 'path'

const isLive = process.env.ASSISTANT_SETUP_LIVE === '1'
/** sample-demo — the one store live checks may write to. */
const TENANT = '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'
const STORE = { id: TENANT, slug: 'sample-demo' }

if (isLive) {
  const file = path.join(process.cwd(), '.env.local')
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

jest.mock('server-only', () => ({}))
jest.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, revalidatePath: jest.fn(), revalidateTag: jest.fn() }))
jest.mock('react', () => ({ ...jest.requireActual('react'), cache: (fn: unknown) => fn }))
jest.mock('@/lib/supabase/server', () => ({ createClient: async () => jest.requireActual('@/lib/supabase/admin').createAdminClient() }))
jest.mock('@/lib/admin-service', () => {
  const owner = { user: { id: 'live-owner' }, userRole: { role: 'admin', tenant_id: '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2', is_owner: true, permissions: null } }
  return { verifyTenantPermission: async () => owner, verifyTenantAdmin: async () => owner }
})

const maybe = isLive ? describe : describe.skip

maybe('Owl set-up proposals, confirmed live on sample-demo', () => {
  jest.setTimeout(60_000)
  const created = { methods: [] as string[], ingredients: [] as string[] }

  afterAll(async () => {
    const admin = jest.requireActual('@/lib/supabase/admin').createAdminClient()
    if (created.methods.length) {
      await admin.from('payment_method_order_types').delete().in('payment_method_id', created.methods)
      await admin.from('payment_methods').delete().in('id', created.methods).eq('tenant_id', TENANT)
    }
    if (created.ingredients.length) await admin.from('inventory_items').delete().in('id', created.ingredients).eq('tenant_id', TENANT)
  })

  test('add a payment method, then switch it off and move it to one order type', async () => {
    const admin = jest.requireActual('@/lib/supabase/admin').createAdminClient()
    const { readPaymentSetup } = await import('@/lib/assistant/data/payment-methods')
    const { matchOrderTypes } = await import('@/lib/assistant/insights/payment-methods')
    const { executePaymentMethod, executePaymentMethodChange } = await import('@/lib/assistant/actions/execute-setup')

    const setup = await readPaymentSetup(TENANT)
    const all = matchOrderTypes(null, setup.orderTypes)
    if (!all.ok || all.ids.length === 0) throw new Error('sample-demo has no enabled order types')

    const added = await executePaymentMethod(STORE, { name: `Owl QA ${Date.now()}`, details: '0918 000 0000 · QA', qrCodeUrl: null, orderTypeIds: all.ids, requireProof: true })
    expect(added).toMatchObject({ ok: true })
    const id = added.ok ? (added.resultRef as string) : ''
    created.methods.push(id)

    const { data: row } = await admin.from('payment_methods').select('is_active, require_payment_proof, updated_at, payment_method_order_types(order_type_id)').eq('id', id).single()
    expect(row.is_active).toBe(true)
    expect(row.require_payment_proof).toBe(true)
    expect(row.payment_method_order_types.map((link: { order_type_id: string }) => link.order_type_id).sort()).toEqual([...all.ids].sort())

    const stale = await executePaymentMethodChange(STORE, {
      paymentMethodId: id, name: 'Owl QA', expectedUpdatedAt: '2000-01-01T00:00:00Z',
      changes: { name: null, details: null, qrCodeUrl: null, isActive: false, requireProof: null, orderTypeIds: null },
    })
    expect(stale.ok).toBe(false)

    const changed = await executePaymentMethodChange(STORE, {
      paymentMethodId: id, name: 'Owl QA', expectedUpdatedAt: row.updated_at,
      changes: { name: null, details: null, qrCodeUrl: null, isActive: false, requireProof: null, orderTypeIds: [all.ids[0]] },
    })
    expect(changed).toMatchObject({ ok: true })
    const { data: after } = await admin.from('payment_methods').select('is_active, payment_method_order_types(order_type_id)').eq('id', id).single()
    expect(after.is_active).toBe(false)
    expect(after.payment_method_order_types).toEqual([{ order_type_id: all.ids[0] }])
  })

  test('add an ingredient (no opening count: the ledger is append-only)', async () => {
    const admin = jest.requireActual('@/lib/supabase/admin').createAdminClient()
    const { executeIngredient } = await import('@/lib/assistant/actions/execute-setup')
    const { data: unit } = await admin.from('inventory_units').select('id, abbreviation').eq('tenant_id', TENANT).eq('is_active', true).limit(1).single()
    const outcome = await executeIngredient(STORE, { name: `Owl QA calamansi ${Date.now()}`, stockUnitId: unit.id, unitLabel: unit.abbreviation, reorderLevel: 10, openingCount: null, category: null })
    expect(outcome).toMatchObject({ ok: true })
    const id = outcome.ok ? (outcome.resultRef as string) : ''
    created.ingredients.push(id)
    const { data: row } = await admin.from('inventory_items').select('current_qty, reorder_level, stock_unit_id').eq('id', id).single()
    expect(Number(row.current_qty)).toBe(0)
    expect(Number(row.reorder_level)).toBe(10)
    expect(row.stock_unit_id).toBe(unit.id)
  })
})
