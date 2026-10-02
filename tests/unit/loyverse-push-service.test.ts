/**
 * pushOrderToLoyverseBestEffort — the once-only guarantee for platform orders.
 *
 * Two confirms can race (web admin + merchant app, two staff on one order).
 * Reading "no receipt yet" and then pushing let both through, booking the sale
 * twice in Loyverse. The service now CLAIMS the order with one conditional
 * UPDATE before anything is sent.
 */

type Result = { data: unknown; error: { message: string } | null }

interface Call {
  table: string
  op: string
  calls: Array<[string, unknown[]]>
}

const calls: Call[] = []
let respond: (call: Call) => Result = () => ({ data: null, error: null })

function chain(table: string): unknown {
  const call: Call = { table, op: 'select', calls: [] }
  calls.push(call)
  const proxy: Record<string, unknown> = {}
  for (const method of ['select', 'update', 'insert', 'delete', 'eq', 'in', 'is', 'or', 'maybeSingle', 'single']) {
    proxy[method] = (...args: unknown[]) => {
      if (['update', 'insert', 'delete'].includes(method)) call.op = method
      call.calls.push([method, args])
      return proxy
    }
  }
  proxy.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(respond(call)).then(resolve, reject)
  return proxy
}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => chain(table) }),
}))

const sendLoyverseReceipt = jest.fn()
jest.mock('@/lib/loyverse/order-push', () => ({
  sendLoyverseReceipt: (...args: unknown[]) => sendLoyverseReceipt(...args),
}))

const loadLoyverseTenant = jest.fn()
jest.mock('@/lib/loyverse/tenant', () => ({
  loadLoyverseTenant: (...args: unknown[]) => loadLoyverseTenant(...args),
}))

import { pushOrderToLoyverseBestEffort } from '@/lib/loyverse/push-service'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const DISH_ID = '33333333-3333-4333-8333-333333333333'

const readyTenant = {
  id: TENANT_ID,
  loyverse_enabled: true,
  loyverse_access_token: 'tok',
  loyverse_store_id: 'store',
  loyverse_payment_type_id: 'pay',
  loyverse_push_mode: 'on_confirm',
}

const line = (menuItemId: string) => ({
  menu_item_id: menuItemId,
  menu_item_name: 'Latte',
  addons: [],
  quantity: 1,
  price: 150,
  subtotal: 150,
})

const isClaim = (call: Call) =>
  call.table === 'orders' && call.op === 'update' && call.calls.some(([method]) => method === 'or')
const outcomeWrites = () =>
  calls.filter((call) => call.table === 'orders' && call.op === 'update' && !isClaim(call))

beforeEach(() => {
  calls.length = 0
  jest.clearAllMocks()
  loadLoyverseTenant.mockResolvedValue(readyTenant)
  sendLoyverseReceipt.mockResolvedValue({ success: true, receiptNumber: 'R-1', unmapped: [] })
})

describe('platform orders', () => {
  it('claims the order, pushes once and records the receipt', async () => {
    respond = (call) => {
      if (isClaim(call)) return { data: { id: ORDER_ID }, error: null }
      if (call.table === 'order_items') return { data: [line(DISH_ID)], error: null }
      return { data: [], error: null }
    }

    const outcome = await pushOrderToLoyverseBestEffort({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      items: [],
      trigger: 'confirm',
    })

    expect(outcome).toMatchObject({ success: true, skipped: false, receiptNumber: 'R-1' })
    expect(sendLoyverseReceipt).toHaveBeenCalledTimes(1)
    const [update] = outcomeWrites()[0].calls
    expect(update[1][0]).toMatchObject({ loyverse_receipt_number: 'R-1', loyverse_push_status: 'pushed' })
  })

  it('does not push when another confirm already holds the claim', async () => {
    respond = (call) => {
      if (isClaim(call)) return { data: null, error: null }
      if (call.table === 'orders') {
        return { data: { loyverse_receipt_number: null, loyverse_push_status: 'pending' }, error: null }
      }
      return { data: [], error: null }
    }

    const outcome = await pushOrderToLoyverseBestEffort({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      items: [],
      trigger: 'confirm',
    })

    expect(sendLoyverseReceipt).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ skipped: true, success: false })
    expect(outcome.error).toMatch(/in progress/)
  })

  it('reports an already-pushed order as a successful skip', async () => {
    respond = (call) => {
      if (isClaim(call)) return { data: null, error: null }
      if (call.table === 'orders') {
        return { data: { loyverse_receipt_number: 'R-9', loyverse_push_status: 'pushed' }, error: null }
      }
      return { data: [], error: null }
    }

    const outcome = await pushOrderToLoyverseBestEffort({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      items: [],
      trigger: 'manual',
    })

    expect(sendLoyverseReceipt).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ success: true, skipped: true, receiptNumber: 'R-9' })
  })

  it('releases the claim as failed when the push crashes', async () => {
    respond = (call) => {
      if (isClaim(call)) return { data: { id: ORDER_ID }, error: null }
      if (call.table === 'order_items') return { data: [line(DISH_ID)], error: null }
      return { data: [], error: null }
    }
    sendLoyverseReceipt.mockRejectedValue(new Error('boom'))

    const outcome = await pushOrderToLoyverseBestEffort({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      items: [],
      trigger: 'confirm',
    })

    expect(outcome).toMatchObject({ success: false, skipped: false, error: 'boom' })
    const [update] = outcomeWrites()[0].calls
    expect(update[1][0]).toMatchObject({ loyverse_push_status: 'failed', loyverse_push_error: 'boom' })
  })
})

describe('receipt catalog lookup', () => {
  it('queries only uuid dish ids, so one POS custom line cannot fail the whole lookup', async () => {
    respond = () => ({ data: [], error: null })

    await pushOrderToLoyverseBestEffort({
      tenantId: TENANT_ID,
      items: [line(DISH_ID), line('custom-open-item'), line('')],
      trigger: 'manual',
    })

    const menuLookup = calls.find((call) => call.table === 'menu_items')
    const inCall = menuLookup?.calls.find(([method]) => method === 'in')
    expect(inCall?.[1]).toEqual(['id', [DISH_ID]])
    // The unmappable lines still travel, so they are reported as unmapped.
    expect(sendLoyverseReceipt.mock.calls[0][1].items).toHaveLength(3)
  })
})

describe('configuration', () => {
  it('names the missing field instead of skipping silently', async () => {
    const outcome = await pushOrderToLoyverseBestEffort({
      tenantId: TENANT_ID,
      items: [line(DISH_ID)],
      trigger: 'manual',
      tenant: { ...readyTenant, loyverse_payment_type_id: null },
    })

    expect(outcome.skipped).toBe(true)
    expect(outcome.error).toMatch(/loyverse_payment_type_id/)
    expect(loadLoyverseTenant).not.toHaveBeenCalled()
  })

  it('skips a trigger the push mode does not fire on', async () => {
    const outcome = await pushOrderToLoyverseBestEffort({
      tenantId: TENANT_ID,
      items: [line(DISH_ID)],
      trigger: 'create',
      tenant: readyTenant,
    })

    expect(outcome.skipped).toBe(true)
    expect(sendLoyverseReceipt).not.toHaveBeenCalled()
  })
})
