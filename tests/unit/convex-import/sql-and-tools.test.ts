import {
  buildImportPlan,
  buildImportSql,
  buildSwitchSql,
  computeDelta,
  CONVEX_IMPORT_NAMESPACE,
  IMPORT_COLUMNS,
  renderBatchTable,
  renderPlan,
  snapshotFromTables,
  tableNameFromEntry,
  uuidOrNull,
  uuidV5,
  withoutNulChars,
} from '@/lib/convex-import'
import { buildPlatformState, buildSnapshot, SLUG } from '../../fixtures/convex-import/snapshot'

const plan = () => buildImportPlan(buildSnapshot(), buildPlatformState())
const options = { generatedAt: '2026-11-12T00:00:00.000Z', sourceLabel: 'fixture' }

describe('uuidV5', () => {
  it('matches the ids every earlier import produced (pinned value)', () => {
    expect(CONVEX_IMPORT_NAMESPACE).toBe('6f9619ff-8b86-d011-b42d-00c04fc964ff')
    expect(uuidV5('k17abc')).toBe('05ea2573-014a-5852-af6a-9dd9e9ef279a')
  })

  it('is a version-5, RFC-variant uuid and deterministic', () => {
    const id = uuidV5('k1o0001')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(uuidV5('k1o0001')).toBe(id)
    expect(uuidV5('k1o0002')).not.toBe(id)
  })

  it('uuidOrNull refuses what a uuid column would', () => {
    expect(uuidOrNull('not-a-uuid')).toBeNull()
    expect(uuidOrNull(42)).toBeNull()
    expect(uuidOrNull('6F9619FF-8B86-4011-B42D-00C04FC964FF')).toBe('6f9619ff-8b86-4011-b42d-00c04fc964ff')
  })
})

describe('buildImportSql', () => {
  it('is ONE statement with no transaction control of its own', () => {
    const sql = buildImportSql(plan(), options)
    const code = sql.split('\n').filter((line) => !line.startsWith('--')).join('\n')
    expect(code.trim().startsWith('do $wn_import$')).toBe(true)
    expect(code.trim().endsWith('$wn_import$;')).toBe(true)
    expect(code).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im)
  })

  it('turns restore mode on before the inserts and checks the plan’s totals at the end', () => {
    const p = plan()
    const sql = buildImportSql(p, options)
    const restore = sql.indexOf("set_config('app.order_restore', 'on', true)")
    expect(restore).toBeGreaterThan(0)
    expect(restore).toBeLessThan(sql.indexOf('insert into public.orders'))
    expect(sql.indexOf('insert into public.product_costs')).toBeLessThan(sql.indexOf('insert into public.order_items'))
    expect(sql).toContain(`v_cents <> ${p.summary.orders.cents}`)
    expect(sql).toContain(`v_cents <> ${p.summary.orders.amountPaidCents}`)
    expect(sql).toContain(`v_n <> ${p.summary.items.count}`)
    for (const table of ['order_stock_applications', 'simple_option_stock_applications', 'stock_movements']) {
      expect(sql).toContain(`update public.${table} t set order_id = m.value`)
    }
  })

  it('names every mapped column, and every mapped row has exactly those columns', () => {
    const p = plan()
    const keys = (rows: object[]) => [...new Set(rows.flatMap((row) => Object.keys(row)))].sort()
    expect(keys(p.rows.orders)).toEqual([...IMPORT_COLUMNS.orders].sort())
    expect(keys(p.rows.order_items)).toEqual([...IMPORT_COLUMNS.order_items].sort())
    expect(keys(p.rows.order_payments)).toEqual([...IMPORT_COLUMNS.order_payments].sort())
    expect(keys(p.rows.order_revisions)).toEqual([...IMPORT_COLUMNS.order_revisions].sort())
    expect(keys(p.rows.product_costs)).toEqual([...IMPORT_COLUMNS.product_costs].sort())
  })

  it('refuses to write SQL for a plan with a blocking problem', () => {
    const snapshot = buildSnapshot()
    snapshot.orders[0].status = 'completed'
    expect(() => buildImportSql(buildImportPlan(snapshot, buildPlatformState()), options)).toThrow(/bad_status/)
  })

  it('keeps the payload inside its dollar quotes whatever the text holds', () => {
    const snapshot = buildSnapshot()
    snapshot.orders[0].customerData = { note: 'tricky $wn_payload$ and $wn_import$ text\u0000' }
    const sql = buildImportSql(buildImportPlan(snapshot, buildPlatformState()), options)
    expect(sql).toContain('$wn_payload1$')
    expect(sql).toContain('do $wn_import1$')
    expect(sql).not.toContain('\u0000')
  })

  it('withoutNulChars counts what it strips', () => {
    expect(withoutNulChars({ a: ['x\u0000y', { b: '\u0000' }] })).toEqual({ value: { a: ['xy', { b: '' }] }, removed: 2 })
  })
})

describe('buildSwitchSql', () => {
  it('checks every imported id and total before flipping, and keeps the deploy key', () => {
    const p = plan()
    const sql = buildSwitchSql(p, { generatedAt: options.generatedAt, expectedDeploymentUrl: 'https://x.convex.cloud' })
    for (const row of p.rows.orders) expect(sql).toContain(row.id)
    expect(sql).toContain(`v_n <> ${p.rows.orders.length} or v_cents <> ${p.summary.orders.cents}`)
    expect(sql).toContain("order_backend = 'platform', convex_deployment_url = null")
    const code = sql.split('\n').filter((line) => !line.startsWith('--')).join('\n')
    expect(code).not.toMatch(/tenant_secrets/i)
    expect(sql).toContain(`slug = '${SLUG}'`)
  })
})

describe('snapshot parsing', () => {
  it('reads documents.jsonl per table and counts every table', () => {
    const snapshot = snapshotFromTables({
      _tables: '{"name":"orders","id":1}\n',
      orders: '{"_id":"a","_creationTime":1,"total":5}\n\n{"_id":"b","_creationTime":2}\n',
      analyticsEvents: '',
      pushTokens: '{"_id":"p","_creationTime":1}\n',
    })
    expect(snapshot.orders.map((o) => o._id)).toEqual(['a', 'b'])
    expect(snapshot.orderItems).toEqual([])
    expect(snapshot.tableCounts).toEqual({ orders: 2, analyticsEvents: 0, pushTokens: 1 })
  })

  it('finds the table of a zip entry', () => {
    expect(tableNameFromEntry('orders/documents.jsonl')).toBe('orders')
    expect(tableNameFromEntry('tables/orderItems/documents.jsonl')).toBe('orderItems')
    expect(tableNameFromEntry('orders/generated_schema.jsonl')).toBeNull()
    expect(tableNameFromEntry('README.md')).toBeNull()
  })
})

describe('computeDelta', () => {
  it('is empty for the same snapshot', () => {
    expect(computeDelta(buildSnapshot(), buildSnapshot()).isEmpty).toBe(true)
  })

  it('reports orders, payments and edits Convex got after the import', () => {
    const imported = buildSnapshot()
    const fresh = buildSnapshot()
    fresh.orders.push({ _id: 'k1onew', _creationTime: Date.parse('2026-11-13T01:00:00Z'), total: 99.5, status: 'pending' })
    fresh.orderPayments.push({ _id: 'k1plate', _creationTime: Date.parse('2026-11-13T02:00:00Z'), orderId: imported.orders[2]._id, kind: 'charge', amount: 90 })
    fresh.orderItems = fresh.orderItems.filter((item) => item.orderId !== imported.orders[0]._id)
    fresh.orderItems.push({ _id: 'k1inew', _creationTime: 1, orderId: imported.orders[0]._id, menuItemName: 'Latte', quantity: 1, price: 1, subtotal: 1 })
    const report = computeDelta(imported, fresh)
    expect(report.newOrders).toEqual({ count: 1, cents: 9950, first: '2026-11-13T01:00:00.000Z', last: '2026-11-13T01:00:00.000Z' })
    expect(report.latePayments).toBe(1)
    expect(report.ordersWithChangedLines).toBe(1)
    expect(report.isEmpty).toBe(false)
  })
})

describe('rendering', () => {
  it('prints counts and problems without customer fields', () => {
    const p = plan()
    const text = renderPlan(p)
    expect(text).toContain('orders          5')
    expect(text).toContain('[warn] unmapped_payment_method')
    for (const order of buildSnapshot().orders) if (order.customerName) expect(text).not.toContain(order.customerName)
  })

  it('renders one markdown table row per store, errors included', () => {
    const p = plan()
    const table = renderBatchTable([
      { slug: 'a', summary: p.summary, problems: p.problems },
      { slug: 'b', error: 'No export' },
    ])
    const lines = table.split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[1]).toMatch(/^\|---\|/)
    expect(lines[2]).toContain('| a | 5 |')
    expect(lines[3]).toContain('ERROR: No export')
  })
})
