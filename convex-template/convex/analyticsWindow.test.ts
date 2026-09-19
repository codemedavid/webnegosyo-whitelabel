import * as analytics from './analytics';

jest.mock('./_generated/server', () => ({
  query: (config: unknown) => config, internalQuery: (config: unknown) => config,
  mutation: (config: unknown) => config, internalMutation: (config: unknown) => config,
}));
jest.mock('./auth', () => ({ requireAccess: jest.fn() }));

/**
 * Bounded report windows on the Convex side.
 *
 * Every analytics query used to derive one cutoff from `Date.now()` and read
 * everything after it. That can express "the last 7 days" and nothing else —
 * a merchant asking how the 3rd went would be shown the 3rd AND every day
 * since, labelled as the 3rd.
 *
 * The rolling behaviour has to survive untouched: most stores run a Convex
 * bundle several versions behind the app and keep sending `daysBack` alone.
 */

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

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-19T05:00:00.000Z');
/** Manila midnight opening Sep 3, and the day it closes. */
const SEP_3 = Date.parse('2026-09-02T16:00:00.000Z');
const SEP_4 = SEP_3 + DAY_MS;

const at = (_id: string, ms: number, total: number): Row => ({
  _id, _creationTime: ms, total, status: 'completed', source: 'web',
  outletId: undefined, customerName: _id, customerContact: _id,
});

/** One order on Sep 3, one the day after, one last week. */
const orders: Row[] = [
  at('sep3', SEP_3 + 6 * 60 * 60 * 1000, 100),
  at('sep4', SEP_4 + 6 * 60 * 60 * 1000, 500),
  at('recent', NOW - 2 * DAY_MS, 900),
];

interface SummaryResult {
  totalRevenue: number;
  totalOrders: number;
  byOrderType: Array<{ revenue: number }>;
  methods: unknown;
}
function handlerFor<T = SummaryResult>(registered: unknown) {
  return (registered as { handler: (ctx: ReturnType<typeof context>, args: Row) => Promise<T> }).handler;
}
const invoke = <T = SummaryResult>(name: keyof typeof analytics, tables: Record<string, Row[]>, args: Row) =>
  handlerFor<T>(analytics[name])(context(tables), args);

beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(NOW); });
afterEach(() => { jest.restoreAllMocks(); });

it('counts only the picked day, not every day after it', async () => {
  const result = await invoke('getSalesAnalytics', { orders }, { startMs: SEP_3, endMs: SEP_4 });

  expect(result.totalOrders).toBe(1);
  expect(result.totalRevenue).toBe(100);
});

it('counts both end days of a range', async () => {
  const result = await invoke('getSalesAnalytics', { orders }, { startMs: SEP_3, endMs: SEP_4 + DAY_MS });

  expect(result.totalOrders).toBe(2);
  expect(result.totalRevenue).toBe(600);
});

it('excludes an order struck at exactly the closing instant', async () => {
  // The window is half-open, so the boundary order belongs to the NEXT day.
  const boundary = [at('boundary', SEP_4, 777)];

  const result = await invoke('getSalesAnalytics', { orders: boundary }, { startMs: SEP_3, endMs: SEP_4 });

  expect(result.totalOrders).toBe(0);
});

it('keeps the rolling window when a screen sends only daysBack', async () => {
  // The compatibility path every unchanged screen still takes.
  const result = await invoke('getSalesAnalytics', { orders }, { daysBack: 7 });

  expect(result.totalOrders).toBe(1);
  expect(result.totalRevenue).toBe(900);
});

it('bounds the trends series to the window', async () => {
  const series = await invoke<Array<{ date: string; totalRevenue: number }>>(
    'getTrends', { orders }, { startMs: SEP_3, endMs: SEP_4 }
  );

  expect(series.map((d) => d.date)).toEqual(['2026-09-03']);
});

it('bounds the payment-method breakdown to the window', async () => {
  const result = await invoke<{ dailyBreakdown: Array<{ date: string }> }>(
    'getPaymentMethodAnalytics', { orders }, { startMs: SEP_3, endMs: SEP_4 }
  );

  expect(result.dailyBreakdown.map((d) => d.date)).toEqual(['2026-09-03']);
});

it('bounds the revenue breakdown to the window', async () => {
  const result = await invoke('getRevenueBreakdown', { orders }, { startMs: SEP_3, endMs: SEP_4 });

  expect(result.byOrderType.reduce((sum, row) => sum + row.revenue, 0)).toBe(100);
});

it('bounds top items to the window', async () => {
  const orderItems = orders.map((o) => ({
    orderId: o._id, menuItemId: o._id, menuItemName: o._id, quantity: 1, subtotal: o.total, isUpsellItem: false,
  }));

  const items = await invoke<Array<{ itemId: string }>>(
    'getTopItems', { orders, orderItems }, { startMs: SEP_3, endMs: SEP_4 }
  );

  expect(items.map((i) => i.itemId)).toEqual(['sep3']);
});

it('bounds event-driven upsell analytics to the window', async () => {
  const analyticsEvents: Row[] = [
    { type: 'upsell_shown', _creationTime: SEP_3 + 1000 },
    { type: 'upsell_shown', _creationTime: SEP_4 + 1000 },
  ];

  const result = await invoke<{ shown: number }>(
    'getUpsellAnalytics', { analyticsEvents }, { startMs: SEP_3, endMs: SEP_4 }
  );

  expect(result.shown).toBe(1);
});
