/**
 * The server read behind the checkout page: one parallel batch, a hard failure
 * for anything checkout cannot run without, and a soft one for the rest.
 */
jest.mock('server-only', () => ({}))

type Result = { data: unknown; error: { message: string } | null }

const tableResults: Record<string, Result> = {}
const readTables: string[] = []

/** A chainable stand-in for one PostgREST query: every filter returns itself. */
function query(table: string) {
  readTables.push(table)
  const result = () => tableResults[table] ?? { data: [], error: null }
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order']) builder[method] = () => builder
  builder.maybeSingle = async () => result()
  builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject)
  return builder
}

jest.mock('@/lib/supabase/public', () => ({
  createPublicClient: () => ({ from: (table: string) => query(table) }),
}))

import { CheckoutConfigLoadError, loadCheckoutConfig } from '@/lib/checkout/load-checkout-config'
import type { Tenant } from '@/types/database'

const SINGLE_BRANCH = { id: 'tenant-1', slug: 'acme' } as unknown as Tenant
const MULTI_BRANCH = {
  id: 'tenant-1',
  slug: 'acme',
  multi_branch_enabled: true,
  facebook_page_id: 'fb-row-1',
} as unknown as Tenant

beforeEach(() => {
  for (const key of Object.keys(tableResults)) delete tableResults[key]
  readTables.length = 0
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => jest.restoreAllMocks())

describe('loadCheckoutConfig', () => {
  it('returns order types and groups fields and payment methods by order type', async () => {
    // Arrange
    tableResults.order_types = { data: [{ id: 'pickup' }], error: null }
    tableResults.customer_form_fields = { data: [{ id: 'f1', order_type_id: 'pickup', field_name: 'name' }], error: null }
    tableResults.payment_methods = {
      data: [{ id: 'cash', payment_method_order_types: [{ order_type_id: 'pickup' }] }],
      error: null,
    }

    // Act
    const config = await loadCheckoutConfig(SINGLE_BRANCH)

    // Assert
    expect(config.orderTypes).toEqual([{ id: 'pickup' }])
    expect(config.formFieldsByOrderType.pickup.map((f) => f.id)).toEqual(['f1'])
    expect(config.paymentMethodsByOrderType.pickup).toEqual([{ id: 'cash' }])
  })

  it('does not read branches or a Facebook page a single-location tenant does not have', async () => {
    const config = await loadCheckoutConfig(SINGLE_BRANCH)

    expect(readTables).not.toContain('outlets')
    expect(readTables).not.toContain('facebook_pages')
    expect(config.outlets).toBeNull()
    expect(config.facebookPageId).toBeNull()
  })

  it('reads branches and the public Messenger page id when the tenant has them', async () => {
    tableResults.outlets = { data: [{ id: 'branch-1' }], error: null }
    tableResults.facebook_pages = { data: { page_id: '1234567890' }, error: null }

    const config = await loadCheckoutConfig(MULTI_BRANCH)

    expect(config.outlets).toEqual([{ id: 'branch-1' }])
    expect(config.facebookPageId).toBe('1234567890')
  })

  it.each(['order_types', 'customer_form_fields', 'payment_methods'])(
    'fails loudly when %s cannot be read, rather than rendering checkout without it',
    async (table) => {
      tableResults[table] = { data: null, error: { message: 'statement timeout' } }

      await expect(loadCheckoutConfig(SINGLE_BRANCH)).rejects.toBeInstanceOf(CheckoutConfigLoadError)
    }
  )

  it('degrades a failed branch or Facebook page read to null, for the browser to handle as before', async () => {
    tableResults.outlets = { data: null, error: { message: 'timeout' } }
    tableResults.facebook_pages = { data: null, error: { message: 'timeout' } }

    const config = await loadCheckoutConfig(MULTI_BRANCH)

    expect(config.outlets).toBeNull()
    expect(config.facebookPageId).toBeNull()
  })
})
