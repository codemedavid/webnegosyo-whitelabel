import type { MutationCtx } from './_generated/server';
import { localDateKey } from './time';

/** The counter read and write share the order transaction; Convex OCC retries conflicts. */
export async function allocateDailyOrderNumber(ctx: MutationCtx, occurredAt: number) {
  const orderDate = localDateKey(occurredAt);
  const counter = await ctx.db.query('dailyOrderCounters')
    .withIndex('by_date', q => q.eq('orderDate', orderDate)).unique();
  // An imported/backfilled receipt may predate its counter row.
  const existing = counter ? [] : await ctx.db.query('orders')
    .withIndex('by_order_date', q => q.eq('orderDate', orderDate)).collect();
  const lastNumber = counter?.lastNumber ?? existing.reduce((max, order) => Math.max(max, order.dailyNumber ?? 0), 0);
  const dailyNumber = lastNumber + 1;
  if (counter) await ctx.db.patch(counter._id, { lastNumber: dailyNumber });
  else await ctx.db.insert('dailyOrderCounters', { orderDate, lastNumber: dailyNumber });
  return { dailyNumber, orderDate };
}
