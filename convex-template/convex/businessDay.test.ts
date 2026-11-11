/**
 * Convex trends and the daily snapshot on the store's business day.
 *
 * With a 4 AM cutoff a 1:30 AM Saturday sale is Friday's trade: Trends must
 * draw it on Friday's bar, and the daily snapshot must be taken once the
 * business day has ENDED (the old 23:59 UTC cron ran at 7:59 AM Manila and
 * only ever captured midnight to 8 AM). No cutoff synced = Manila midnight.
 */
import * as analytics from './analytics';
import { aggregateBusinessDay } from './statsAggregator';
import { BUSINESS_DAY_CUTOFFS_CONFIG_KEY, previousBusinessDayWindow } from './time';

jest.mock('./_generated/server', () => ({
  query: (config: unknown) => config, internalQuery: (config: unknown) => config,
  mutation: (config: unknown) => config, internalMutation: (config: unknown) => config,
  internalAction: (config: unknown) => config,
}));
jest.mock('./_generated/api', () => ({
  internal: {
    businessDayConfig: { getCutoffScheduleInternal: 'businessDayConfig:getCutoffScheduleInternal' },
    orders: { getDashboardStatsByPeriodInternal: 'orders:getDashboardStatsByPeriodInternal' },
    analytics: {
      getUpsellAnalyticsInternal: 'analytics:getUpsellAnalyticsInternal',
      getTopItemsInternal: 'analytics:getTopItemsInternal',
    },
    statsAggregator: { upsertDailyStat: 'statsAggregator:upsertDailyStat' },
  },
}));
jest.mock('./auth', () => ({ requireAccess: jest.fn() }));

type Row = Record<string, unknown>;
type Expr = (row: Row) => unknown;
const value = (input: unknown, row: Row): unknown => typeof input === 'function' ? input(row) : input;
const q = {
  field: (path: string) => (row: Row) => row[path],
  eq: (a: unknown, b: unknown) => (row: Row) => value(a, row) === value(b, row),
  neq: (a: unknown, b: unknown) => (row: Row) => value(a, row) !== value(b, row),
  gte: (a: unknown, b: unknown) => (row: Row) => Number(value(a, row)) >= Number(value(b, row)),
  lte: (a: unknown, b: unknown) => (row: Row) => Number(value(a, row)) <= Number(value(b, row)),
  lt: (a: unknown, b: unknown) => (row: Row) => Number(value(a, row)) < Number(value(b, row)),
  and: (...exprs: Expr[]) => (row: Row) => exprs.every((e) => e(row)),
  or: (...exprs: Expr[]) => (row: Row) => exprs.some((e) => e(row)),
};
interface IndexRange {
  eq: (field: string, expected: unknown) => IndexRange;
  gte: (field: string, bound: number) => IndexRange;
}
function context(tables: Record<string, Row[]>) {
  return { db: { query: (table: string) => {
    let rows = tables[table] ?? [];
    const builder = {
      filter: (fn: (query: typeof q) => Expr) => { rows = rows.filter(fn(q)); return builder; },
      withIndex: (_name: string, fn?: (index: IndexRange) => unknown) => {
        if (fn) {
          const tests: Expr[] = [];
          const index: IndexRange = {
            eq: (field, expected) => { tests.push((row) => row[field] === expected); return index; },
            gte: (field, bound) => { tests.push((row) => Number(row[field]) >= bound); return index; },
          };
          fn(index);
          rows = rows.filter((row) => tests.every((test) => test(row)));
        }
        return builder;
      },
      order: () => builder,
      take: async (n: number) => rows.slice(0, n),
      collect: async () => rows,
      first: async () => rows[0] ?? null,
    };
    return builder;
  } } };
}

const manila = (local: string): number => Date.parse(`${local}+08:00`);
const FOUR_AM_ROW = { key: BUSINESS_DAY_CUTOFFS_CONFIG_KEY, value: JSON.stringify([{ effectiveFrom: '2026-01-01', cutoffMinutes: 240 }]) };
const sale = (_id: string, at: number, total: number) => ({ _id, _creationTime: at, total, status: 'completed', source: 'web' });

type Handler<T> = { handler: (ctx: unknown, args: Row) => Promise<T> };
type TrendRow = { date: string; totalRevenue: number };
const trends = (tables: Record<string, Row[]>, args: Row) =>
  (analytics.getTrends as unknown as Handler<TrendRow[]>).handler(context(tables), args);

describe('getTrends on the business day', () => {
  const window = { startMs: manila('2026-10-24T00:00:00.000'), endMs: manila('2026-10-26T04:00:00.000') };
  const orders = [sale('fri-night', manila('2026-10-24T22:00:00.000'), 100), sale('sat-early', manila('2026-10-25T01:30:00.000'), 50)];

  it("draws a 1:30 AM sale on the night before's bar with a 4 AM cutoff", async () => {
    const rows = await trends({ orders, tenantConfig: [FOUR_AM_ROW] }, window);
    expect(rows.map((row) => [row.date, row.totalRevenue])).toEqual([['2026-10-24', 150]]);
  });

  it('keeps the Manila calendar date with no cutoff synced', async () => {
    const rows = await trends({ orders, tenantConfig: [] }, window);
    expect(rows.map((row) => [row.date, row.totalRevenue])).toEqual([['2026-10-24', 100], ['2026-10-25', 50]]);
  });
});

describe('previousBusinessDayWindow', () => {
  const schedule = [{ effectiveFrom: '2026-01-01', cutoffMinutes: 240 }];

  it('is the business day that ended most recently', () => {
    // 12:00 PM Saturday: Friday (Fri 4 AM to Sat 4 AM) has ended.
    expect(previousBusinessDayWindow(manila('2026-10-25T12:00:00.000'), schedule)).toEqual({
      dayKey: '2026-10-24',
      startMs: manila('2026-10-24T04:00:00.000'),
      endMs: manila('2026-10-25T04:00:00.000'),
    });
  });

  it('is yesterday, midnight to midnight, with no cutoff', () => {
    expect(previousBusinessDayWindow(manila('2026-10-25T12:00:00.000'), [])).toEqual({
      dayKey: '2026-10-24',
      startMs: manila('2026-10-24T00:00:00.000'),
      endMs: manila('2026-10-25T00:00:00.000'),
    });
  });
});

describe('aggregateBusinessDay (the daily snapshot)', () => {
  it('snapshots the business day that just ended, over its own window', async () => {
    jest.useFakeTimers().setSystemTime(manila('2026-10-25T12:00:00.000'));
    const calls: Array<[string, Row]> = [];
    const ctx = {
      runQuery: async (ref: string, args: Row) => {
        calls.push([ref, args]);
        if (ref === 'businessDayConfig:getCutoffScheduleInternal') return [{ effectiveFrom: '2026-01-01', cutoffMinutes: 240 }];
        if (ref === 'orders:getDashboardStatsByPeriodInternal') return { totalOrders: 3, totalRevenue: 300, avgOrderValue: 100 };
        if (ref === 'analytics:getUpsellAnalyticsInternal') return { conversionRate: 0.5 };
        return [];
      },
      runMutation: async (ref: string, args: Row) => { calls.push([ref, args]); },
    };
    try {
      await (aggregateBusinessDay as unknown as Handler<void>).handler(ctx, {});
    } finally {
      jest.useRealTimers();
    }
    const start = manila('2026-10-24T04:00:00.000');
    const end = manila('2026-10-25T04:00:00.000');
    expect(calls).toEqual([
      ['businessDayConfig:getCutoffScheduleInternal', {}],
      // Inclusive at both ends on this query, so the end is one ms before the next day.
      ['orders:getDashboardStatsByPeriodInternal', { startDate: start, endDate: end - 1 }],
      ['analytics:getUpsellAnalyticsInternal', { startMs: start, endMs: end }],
      ['analytics:getTopItemsInternal', { startMs: start, endMs: end, limit: 10 }],
      ['statsAggregator:upsertDailyStat', {
        date: '2026-10-24', totalOrders: 3, totalRevenue: 300, avgOrderValue: 100, upsellConversionRate: 0.5, topItems: [],
      }],
    ]);
  });
});

describe('getPaymentMethodAnalytics daily breakdown on the business day', () => {
  type Breakdown = { dailyBreakdown: Array<{ date: string; methods: Record<string, number> }> };
  const run = (tables: Record<string, Row[]>) =>
    (analytics.getPaymentMethodAnalytics as unknown as Handler<Breakdown>).handler(context(tables), {
      startMs: manila('2026-10-24T00:00:00.000'),
      endMs: manila('2026-10-26T04:00:00.000'),
    });
  const orders = [{ ...sale('late', manila('2026-10-25T01:30:00.000'), 50), paymentMethod: 'Cash' }];

  it('puts a 1:30 AM payment on the night before with a 4 AM cutoff', async () => {
    const { dailyBreakdown } = await run({ orders, tenantConfig: [FOUR_AM_ROW] });
    expect(dailyBreakdown.map((row) => row.date)).toEqual(['2026-10-24']);
  });

  it('keeps the Manila date with no cutoff synced', async () => {
    const { dailyBreakdown } = await run({ orders, tenantConfig: [] });
    expect(dailyBreakdown.map((row) => row.date)).toEqual(['2026-10-25']);
  });
});
