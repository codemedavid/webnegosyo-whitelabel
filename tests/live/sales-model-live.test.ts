/** @jest-environment node */
/**
 * LIVE reconciliation of the sales model against a real store (plan §10.1).
 *
 * Reads one window of a platform store's orders, lines and settlement ledger,
 * runs them through sales-model / payment-buckets, and checks the invariants
 * on real data. With SALES_LIVE_EXPECT (the figures from the independent SQL in
 * docs/testing/reports-sales-model.tdd.md, as JSON in pesos) it also checks the
 * engine against that SQL to the centavo. Read-only.
 *
 * Opt-in:
 *   SALES_LIVE=1 SALES_LIVE_TENANT=<uuid> SALES_LIVE_FROM=<iso> SALES_LIVE_TO=<iso> \
 *     [SALES_LIVE_EXPECT='{"orders":…}'] npx jest tests/live/sales-model-live.test.ts
 */
import fs from 'fs'
import path from 'path'

const isLive = process.env.SALES_LIVE === '1'

if (isLive) {
  // The test environment loads .env.test (fake hosts); a live run must use the real ones.
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const liveDescribe = isLive ? describe : describe.skip
const PAGE_SIZE = 1000
const ID_CHUNK = 150

type Admin = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>

async function readPaged<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await read(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function readByOrder<T>(admin: Admin, table: string, columns: string, orderIds: string[]): Promise<T[]> {
  const rows: T[] = []
  for (let i = 0; i < orderIds.length; i += ID_CHUNK) {
    const ids = orderIds.slice(i, i + ID_CHUNK)
    rows.push(
      ...(await readPaged<T>((from, to) =>
        admin.from(table as never).select(columns).in('order_id', ids).order('order_id').order('id').range(from, to),
      )),
    )
  }
  return rows
}

function cents(pesos: string | number): number {
  return Math.round(Number(pesos) * 100)
}

liveDescribe('sales model on a live store', () => {
  test('reconciles', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { toReportOrder, REPORT_ORDER_COLUMNS, REPORT_ITEM_COLUMNS, REPORT_PAYMENT_COLUMNS } = await import(
      '@/lib/reports/read/platform-order-row'
    )
    const { summarizeSales, rollupLines, rollupOrders, isLiveOrder } = await import('@/lib/reports/sales-model')
    const { bucketPayments } = await import('@/lib/reports/payment-buckets')
    type Row = Parameters<typeof toReportOrder>[0]
    type Item = Parameters<typeof toReportOrder>[1][number]
    type Pay = Parameters<typeof toReportOrder>[2][number]

    const tenant = process.env.SALES_LIVE_TENANT ?? ''
    const fromIso = process.env.SALES_LIVE_FROM ?? ''
    const toIso = process.env.SALES_LIVE_TO ?? ''
    expect(tenant && fromIso && toIso).toBeTruthy()
    const admin = createAdminClient()

    const rows = await readPaged<Row>((from, to) =>
      admin
        .from('orders')
        .select(REPORT_ORDER_COLUMNS)
        .eq('tenant_id', tenant)
        .gte('created_at', fromIso)
        .lt('created_at', toIso)
        .order('created_at')
        .order('id')
        .range(from, to),
    )
    const ids = rows.map((row) => row.id)
    const items = await readByOrder<Item>(admin, 'order_items', REPORT_ITEM_COLUMNS, ids)
    const payments = await readByOrder<Pay>(admin, 'order_payments', REPORT_PAYMENT_COLUMNS, ids)

    const itemsBy = Map.groupBy(items, (item) => item.order_id)
    const paymentsBy = Map.groupBy(payments, (payment) => payment.order_id)
    const orders = rows.map((row) => toReportOrder(row, itemsBy.get(row.id) ?? [], paymentsBy.get(row.id) ?? []))
    const summary = summarizeSales(orders)

    const billed = rows.filter((row) => isLiveOrder({ status: row.status ?? '', total: row.total })).reduce((s, r) => s + cents(r.total ?? 0), 0)
    expect(summary.billedCents).toBe(billed)
    expect(summary.grossCents - summary.discountCents).toBe(summary.netCents)
    expect(summary.netCents + summary.serviceCents + summary.deliveryCents).toBe(summary.billedCents)
    const sumNet = (m: Map<string, { netCents: number }>) => [...m.values()].reduce((s, r) => s + r.netCents, 0)
    expect(sumNet(rollupLines(orders, (l) => l.menuItemId ?? l.name))).toBe(summary.netCents)
    expect(sumNet(rollupLines(orders, (l) => l.categoryName ?? '∅'))).toBe(summary.netCents)
    expect(sumNet(rollupOrders(orders, (o) => o.channel))).toBe(summary.netCents)
    expect(sumNet(rollupOrders(orders, (o) => o.outletId ?? 'unassigned'))).toBe(summary.netCents)
    const buckets = bucketPayments(orders)
    expect(buckets.buckets.reduce((s, b) => s + b.cents, 0)).toBe(summary.collectedCents)
    expect(summary.collectedCents - summary.overpaidCents + summary.unpaidCents).toBe(summary.billedCents)

    const expected = process.env.SALES_LIVE_EXPECT
    if (expected) {
      const sql = JSON.parse(expected) as Record<string, string | number>
      expect({
        orders: summary.orders,
        gross: summary.grossCents,
        disc: summary.discountCents,
        refunds: summary.refundCents,
        net: summary.netCents,
        svc: summary.serviceCents,
        delivery: summary.deliveryCents,
        billed: summary.billedCents,
        collected: summary.collectedCents,
        unpaid: summary.unpaidCents,
        overpaid: summary.overpaidCents,
        voids: summary.voids.orders,
        void_billed: summary.voids.billedCents,
      }).toEqual({
        orders: Number(sql.orders),
        gross: cents(sql.gross),
        disc: cents(sql.disc),
        refunds: cents(sql.refunds),
        net: cents(sql.net),
        svc: cents(sql.svc),
        delivery: cents(sql.delivery),
        billed: cents(sql.billed),
        collected: cents(sql.collected),
        unpaid: cents(sql.unpaid),
        overpaid: cents(sql.overpaid),
        voids: Number(sql.voids),
        void_billed: cents(sql.void_billed),
      })
    }
  }, 180_000)
})
