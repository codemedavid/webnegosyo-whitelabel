/** @jest-environment node */
/**
 * The merchant app's Reports tab splits revenue into regulars / first-timers /
 * unnamed (`POST /api/customers/hub-overview` → `buildCustomerDashboard`). On
 * a platform store each order is worth its NET SALES by the one sales model,
 * so the split adds up to /admin/reports for the same orders — not to the
 * bill totals, which carry delivery fees and service charge (plan 2026-11-24 §B).
 *
 * Loyalty still earns and checks its minimum spend on the bill (`netTotal`).
 */
import { fakeSupabaseTables } from '../fixtures/fake-supabase-tables'
import { buildCustomerDashboard } from '@/lib/customer-dashboard'
import { factSales, type CustomerOrderFact } from '@/lib/customer-order-facts'
import { qualifyOrderForProgram } from '@/lib/loyalty/qualify'
import { fetchCustomerOrderFacts } from '@/lib/queries/customer-facts'
import { fromCents } from '@/lib/reports/money'
import { toReportOrder, type PlatformOrderRow } from '@/lib/reports/read/platform-order-row'
import { summarizeSales } from '@/lib/reports/sales-model'

const TENANT = { id: 'tenant-1', order_backend: 'platform' as const }
const NOW = new Date('2026-11-24T06:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

const PROMO_30 = { total: 30, deliveryDiscount: 0, lines: [{ label: 'Promo', amount: 30 }], allocationsByLine: {} }
const FREE_DELIVERY = { total: 50, deliveryDiscount: 50, lines: [{ label: 'Free delivery', amount: 50 }], allocationsByLine: {} }

type Row = PlatformOrderRow & {
  tenant_id: string
  customer_id: string | null
  customer_contact: string | null
  updated_at: string
}

function order(id: string, daysAgo: number, total: number, extra: Partial<Row> = {}): Row {
  const at = new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString()
  return {
    id,
    tenant_id: TENANT.id,
    customer_id: null,
    customer_contact: null,
    created_at: at,
    updated_at: at,
    status: 'confirmed',
    payment_status: 'paid',
    source: 'pos',
    order_type: 'dine_in',
    outlet_id: null,
    total,
    service_charge_amount: 0,
    delivery_fee: 0,
    discount_data: null,
    customer_data: {},
    payment_method_id: null,
    payment_method_name: null,
    ...extra,
  }
}

const ROWS: Row[] = [
  // Ana's first order (60 days ago, outside the 30-day window) and a repeat delivery:
  // ₱280 of food − ₱30 promo + ₱50 delivery = ₱300 billed, net ₱250.
  order('ana-first', 60, 120, { customer_id: 'ana' }),
  order('ana-delivery', 3, 300, {
    customer_id: 'ana',
    source: 'web',
    order_type: 'delivery',
    status: 'delivered',
    payment_status: 'pending',
    delivery_fee: 50,
    discount_data: PROMO_30,
  }),
  // Ben's first ever order: free delivery from the POS blob, ₱150 billed = net ₱150.
  order('ben-first', 2, 150, { customer_id: 'ben', delivery_fee: 50, customer_data: { discount: FREE_DELIVERY } }),
  // A walk-in with a service charge: ₱110 billed, net ₱100.
  order('walk-in', 1, 110, { service_charge_amount: 10 }),
  // Not visits: unpaid at the counter, cancelled.
  order('unpaid', 1, 75, { payment_status: 'pending' }),
  order('cancelled', 1, 999, { status: 'cancelled' }),
]

async function readFacts(): Promise<CustomerOrderFact[]> {
  const { client } = fakeSupabaseTables({ orders: ROWS, order_items: [] })
  const result = await fetchCustomerOrderFacts(TENANT, {
    days: 90,
    includeLifetime: true,
    platformClient: client as never,
    now: NOW,
  })
  expect(result.coverage.complete).toBe(true)
  return result.facts
}

describe('customer dashboard revenue = report net sales', () => {
  it('a platform fact carries the order’s net sales beside its bill', async () => {
    const facts = await readFacts()
    const byId = new Map(facts.map((fact) => [fact.externalOrderId, fact]))

    expect(byId.get('ana-delivery')).toMatchObject({ netTotal: 300, netSales: 250 })
    expect(byId.get('ben-first')).toMatchObject({ netTotal: 150, netSales: 150 })
    expect(byId.get('walk-in')).toMatchObject({ netTotal: 110, netSales: 100 })
    expect(factSales(byId.get('ana-delivery')!)).toBe(250)
  })

  it('the 30-day split adds up to summarizeSales over the same (qualified) orders', async () => {
    const facts = await readFacts()
    const window = buildCustomerDashboard(facts, { now: NOW, tillComplete: true }).windows.find((w) => w.days === 30)
    if (!window) throw new Error('no 30-day window')

    const sameOrders = ROWS.filter((row) => ['ana-delivery', 'ben-first', 'walk-in'].includes(row.id))
    const net = fromCents(summarizeSales(sameOrders.map((row) => toReportOrder(row, [], []))).netCents)

    expect(net).toBe(500)
    expect(window.revenue).toEqual({ total: net, returning: 250, new: 150, unknown: 100 })
    expect(window.topCustomers.find((customer) => customer.customerId === 'ana')).toMatchObject({ spend: 250 })
  })

  it('open orders (live, not completed) ride beside the split, so completed + open = report net sales', async () => {
    // Koko Coffee, 2026-11-24: the app's Reports hero read completed sales only, below Net sales.
    const facts = await readFacts()
    const window = buildCustomerDashboard(facts, { now: NOW, tillComplete: true }).windows.find((w) => w.days === 30)
    if (!window) throw new Error('no 30-day window')

    const live = ROWS.filter((row) => ['ana-delivery', 'ben-first', 'walk-in', 'unpaid', 'cancelled'].includes(row.id))
    const net = fromCents(summarizeSales(live.map((row) => toReportOrder(row, [], []))).netCents)

    expect(window.openOrders).toBe(1)
    expect(window.openRevenue).toBe(75)
    expect(window.revenue.total + window.openRevenue).toBe(net)
    expect(window.orders + window.openOrders).toBe(4)
  })

  it('stores whose till is not fully visible carry no open orders', async () => {
    const facts = await readFacts()
    const window = buildCustomerDashboard(facts, { now: NOW, tillComplete: false }).windows.find((w) => w.days === 30)

    expect(window).toMatchObject({ openOrders: 0, openRevenue: 0, previousOpenOrders: 0, previousOpenRevenue: 0 })
  })

  it('a ledger fact (Convex / tenant Supabase) has no net and keeps its bill', () => {
    const fact: CustomerOrderFact = {
      backend: 'convex',
      externalOrderId: 'x',
      customerId: 'ana',
      phoneE164: null,
      source: 'online',
      status: 'delivered',
      paymentStatus: 'paid',
      branchId: null,
      netTotal: 300,
      orderedAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      items: [],
    }
    expect(factSales(fact)).toBe(300)
    expect(buildCustomerDashboard([fact], { now: new Date(NOW.getTime() + 1), tillComplete: false }).windows[0].revenue.total).toBe(300)
  })

  it('loyalty’s minimum spend still reads the bill, not net sales', async () => {
    const facts = await readFacts()
    const delivery = { ...facts.find((fact) => fact.externalOrderId === 'ana-delivery')!, phoneE164: '+639171234567' }
    const program = {
      status: 'active',
      scope: 'business',
      outletId: null,
      activatesAt: '2026-01-01T00:00:00.000Z',
      endsAt: null,
      version: { rules: { minSpend: 280 } },
    }
    // Billed ₱300 ≥ ₱280 although net sales are ₱250.
    expect(qualifyOrderForProgram(program as never, delivery)).toEqual({ isQualified: true })
  })
})
