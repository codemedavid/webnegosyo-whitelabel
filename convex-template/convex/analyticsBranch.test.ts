import * as analytics from './analytics';

jest.mock('./_generated/server', () => ({
  query: (config: unknown) => config, internalQuery: (config: unknown) => config,
  mutation: (config: unknown) => config, internalMutation: (config: unknown) => config,
}));
jest.mock('./auth', () => ({ requireAccess: jest.fn() }));

// In-memory database boundary: execute the handler's actual query predicates.
type Row = Record<string, unknown>;
type Expr = (row: Row) => unknown;
const value = (input: unknown, row: Row): unknown => typeof input === 'function' ? input(row) : input;
const q = {
  field: (path: string) => (row: Row) => path.split('.').reduce<unknown>((obj, key) => obj && typeof obj === 'object' ? (obj as Row)[key] : undefined, row),
  eq: (a: unknown, b: unknown) => (row: Row) => value(a, row) === value(b, row),
  neq: (a: unknown, b: unknown) => (row: Row) => value(a, row) !== value(b, row),
  gte: (a: unknown, b: unknown) => (row: Row) => Number(value(a, row)) >= Number(value(b, row)),
  lte: (a: unknown, b: unknown) => (row: Row) => Number(value(a, row)) <= Number(value(b, row)),
  lt: (a: unknown, b: unknown) => (row: Row) => Number(value(a, row)) < Number(value(b, row)),
  and: (...exprs: Expr[]) => (row: Row) => exprs.every(e => e(row)),
  or: (...exprs: Expr[]) => (row: Row) => exprs.some(e => e(row)),
};
function context(tables: Record<string, Row[]>) {
  return { db: { query: (table: string) => {
    let rows = tables[table] ?? [];
    const builder = {
      filter: (fn: (query: typeof q) => Expr) => { rows = rows.filter(fn(q)); return builder; },
      withIndex: (_name: string, fn: (index: { eq: (field: string, expected: unknown) => Expr }) => Expr) => { rows = rows.filter(fn({ eq: (field: string, expected: unknown) => (row: Row) => row[field] === expected })); return builder; },
      order: () => builder,
      take: async (n: number) => rows.slice(0, n),
      collect: async () => rows,
    };
    return builder;
  } } };
}
const now = Date.now();
const order = (_id: string, outletId: string | undefined, total: number, extra: Row = {}) => ({
  _id, outletId, total, _creationTime: now, status: 'completed', source: 'web',
  customerName: _id, customerContact: _id, ...extra,
});
const orders = [
  order('north', 'north', 100),
  order('south', 'south', 900),
  order('legacy', undefined, 50, { customerData: { outlet_id: 'north' } }),
  order('unassigned', undefined, 700),
  order('conflict', 'south', 800, { customerData: { outlet_id: 'north' } }),
];
// The SDK erases handler return types from its public registration wrapper.
// Declare the response fields asserted here at that mocked boundary.
interface SummaryResult {
  totalRevenue: number;
  totalOrders: number;
  ordersByChannel: unknown;
  byOrderType: Array<{ revenue: number }>;
  methods: unknown;
  heatmap: Array<{ count: number }>;
  totalCustomers: number;
  totalUpsellRevenue: number;
}
interface ProductResult { menuItemId: string; totalRevenue: number }
type AnalyticsResult<K> = K extends 'getTopItems' ? Array<{ itemId: string }>
  : K extends 'getTrends' ? Array<{ date: string; totalRevenue: number }>
  : SummaryResult;
function handlerFor<T = SummaryResult>(registered: unknown) {
  return (registered as {
    handler: (ctx: ReturnType<typeof context>, args: Row) => Promise<T>
  }).handler;
}
const invoke = <K extends keyof typeof analytics>(name: K, tables: Record<string, Row[]>, args: Row = {}) =>
  handlerFor<AnalyticsResult<K>>(analytics[name])(context(tables), { daysBack: 7, outletId: 'north', ...args });

it('isolates sales, channel counts and growth to the selected branch, including legacy orders', async () => {
  const result = await invoke('getSalesAnalytics', { orders });
  expect(result.totalRevenue).toBe(150);
  expect(result.totalOrders).toBe(2);
  expect(result.ordersByChannel).toEqual([{ source: 'web', count: 2, revenue: 150 }]);
});

it('keeps every order-based analytics surface within the branch', async () => {
  const tables = { orders, orderItems: orders.map(o => ({ orderId: o._id, menuItemId: o._id, menuItemName: o._id, quantity: 1, subtotal: o.total, isUpsellItem: true })) };
  const top = await invoke('getTopItems', tables);
  expect(top.map((row) => row.itemId).sort()).toEqual(['legacy', 'north']);
  const trends = await invoke('getTrends', tables);
  expect(trends.reduce((sum, row) => sum + row.totalRevenue, 0)).toBe(150);
  const revenue = await invoke('getRevenueBreakdown', tables);
  expect(revenue.byOrderType.reduce((sum, row) => sum + row.revenue, 0)).toBe(150);
  const payments = await invoke('getPaymentMethodAnalytics', tables);
  expect(payments.methods).toEqual([{ method: 'Unknown', count: 2, revenue: 150, percentage: 1, avgOrderValue: 75 }]);
  const heatmap = await invoke('getOrderHeatmap', tables);
  expect(heatmap.heatmap.reduce((sum, cell) => sum + cell.count, 0)).toBe(2);
  const customers = await invoke('getCustomerInsights', tables);
  expect(customers.totalCustomers).toBe(2);
  const upsells = await invoke('getUpsellTrends', tables);
  expect(upsells.totalUpsellRevenue).toBe(150);
});

it('excludes other-branch and unattributed funnel events', async () => {
  const analyticsEvents = ['north', 'south', undefined].flatMap(outlet_id =>
    ['upsell_shown', 'upsell_clicked', 'upsell_converted', 'bundle_viewed', 'bundle_added'].map(type => ({
      type, _creationTime: now, metadata: { outlet_id },
    })),
  );
  expect(await invoke('getUpsellAnalytics', { analyticsEvents })).toMatchObject({ shown: 1, clicked: 1, converted: 1 });
  expect(await invoke('getBundleAnalytics', { analyticsEvents })).toMatchObject({ viewed: 1, added: 1 });
});

it('retains all-branches totals when no branch is requested', async () => {
  expect(await invoke('getSalesAnalytics', { orders }, { outletId: undefined })).toMatchObject({ totalRevenue: 2550, totalOrders: 5 });
});

it('computes branch product insights from that branch orders instead of the store-wide snapshot', async () => {
  const { getAll } = await import('./productAnalytics');
  const result = await handlerFor<ProductResult[]>(getAll)(context({
    orders,
    orderItems: orders.map(o => ({ orderId: o._id, menuItemId: o._id, menuItemName: o._id, quantity: 1, subtotal: o.total })),
    productCosts: [],
    productAnalytics: [{ menuItemId: 'south', period: '30d', totalRevenue: 2550 }],
  }), { period: '30d', outletId: 'north' });
  expect(result.map((row) => row.menuItemId).sort()).toEqual(['legacy', 'north']);
  expect(result.reduce((sum, row) => sum + row.totalRevenue, 0)).toBe(150);
});

it('recognizes checkout events already stored with camelCase branch metadata', async () => {
  const analyticsEvents = [
    { type: 'upsell_converted', _creationTime: now, metadata: { outletId: 'north' } },
    { type: 'upsell_converted', _creationTime: now, metadata: { outlet_id: 'south', outletId: 'north' } },
  ];
  expect(await invoke('getUpsellAnalytics', { analyticsEvents })).toMatchObject({ converted: 1 });
});


it('filters before the row cap so busy South cannot crowd North out of analytics', async () => {
  const busy = Array.from({ length: 10001 }, (_, i) => order(`south-${i}`, 'south', 900));
  expect(await invoke('getSalesAnalytics', { orders: [...busy, order('north', 'north', 100)] }))
    .toMatchObject({ totalOrders: 1, totalRevenue: 100 });
});


it('attributes delayed loyalty projections to the sale day, not the sync day', async () => {
  const { localDateKey } = await import('./time');
  const saleTime = now - 8 * 86400000;
  const projected = order('projected', 'north', 100, { source: 'pos', saleOccurredAt: saleTime });
  const tables = { orders: [projected] };
  const current = await invoke('getSalesAnalytics', tables);
  expect(current.totalRevenue).toBe(0);
  const trends = await invoke('getTrends', tables, { daysBack: 14 });
  expect(trends.find((row) => row.date === localDateKey(saleTime))?.totalRevenue).toBe(100);
  expect(trends.find((row) => row.date === localDateKey(now))?.totalRevenue ?? 0).toBe(0);
});


it('daily dashboard windows include a delayed sale only on its settlement date', async () => {
  const { getDashboardStatsByPeriodInternal } = await import('./orders');
  const settledAt = Date.parse('2026-09-15T15:59:00.000Z');
  const projectedAt = Date.parse('2026-09-15T16:01:00.000Z');
  const ctx = context({ orders: [order('delayed', 'north', 100, { _creationTime: projectedAt, saleOccurredAt: settledAt })] });
  const handler = handlerFor(getDashboardStatsByPeriodInternal);
  const oldDay = await handler(ctx, { startDate: Date.parse('2026-09-14T16:00:00.000Z'), endDate: Date.parse('2026-09-15T15:59:59.999Z') });
  const nextDay = await handler(ctx, { startDate: Date.parse('2026-09-15T16:00:00.000Z'), endDate: Date.parse('2026-09-16T15:59:59.999Z') });
  expect(oldDay.totalRevenue).toBe(100);
  expect(nextDay.totalRevenue).toBe(0);
});


it('does not count a month-old projected sale as a new product sale', async () => {
  const { getAll } = await import('./productAnalytics');
  const ctx = context({
    orders: [order('old', 'north', 100, { saleOccurredAt: now - 31 * 86400000 })],
    orderItems: [{ orderId: 'old', menuItemId: 'coffee', menuItemName: 'Coffee', quantity: 1, subtotal: 100 }],
    productCosts: [],
  });
  expect(await handlerFor<ProductResult[]>(getAll)(ctx, { period: '30d', outletId: 'north' })).toEqual([]);
});
