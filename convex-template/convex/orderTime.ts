import type { FilterBuilder } from 'convex/server';
import type { DataModel } from './_generated/dataModel';

/** Projection writes happen later than the sale; old orders use insertion time. */
export function orderTime(order: { _creationTime: number; saleOccurredAt?: number }) {
  return order.saleOccurredAt ?? order._creationTime;
}

/** Existing clients consume _creationTime as the order's business timestamp. */
export function orderForClient<T extends { _creationTime: number; saleOccurredAt?: number }>(order: T): T {
  return order.saleOccurredAt === undefined ? order : { ...order, _creationTime: orderTime(order) };
}

/** Apply the business-time window before the query limit. */
export function orderTimeFilter(q: FilterBuilder<DataModel['orders']>, op: 'gte' | 'lt' | 'lte', instant: number) {
  return q.or(
    q.and(q.neq(q.field('saleOccurredAt'), undefined), q[op](q.field('saleOccurredAt'), instant)),
    q.and(q.eq(q.field('saleOccurredAt'), undefined), q[op](q.field('_creationTime'), instant)),
  );
}
