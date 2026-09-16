import type { FilterBuilder } from 'convex/server';
import type { DataModel } from './_generated/dataModel';

/** Apply before the limit so another branch cannot crowd out this branch. */
export function orderBranchFilter(q: FilterBuilder<DataModel['orders']>, outletId?: string) {
  if (!outletId) return q.eq(true, true);
  return q.or(
    q.eq(q.field('outletId'), outletId),
    q.and(
      q.or(q.eq(q.field('outletId'), undefined), q.eq(q.field('outletId'), null), q.eq(q.field('outletId'), '')),
      q.eq(q.field('customerData.outlet_id'), outletId),
    ),
  );
}

/** Unattributed events belong only in the all-branches view. */
export function eventBranchFilter(q: FilterBuilder<DataModel['analyticsEvents']>, outletId?: string) {
  if (!outletId) return q.eq(true, true);
  return q.or(
    q.eq(q.field('metadata.outlet_id'), outletId),
    q.and(
      q.or(q.eq(q.field('metadata.outlet_id'), undefined), q.eq(q.field('metadata.outlet_id'), null)),
      q.eq(q.field('metadata.outletId'), outletId),
    ),
  );
}
