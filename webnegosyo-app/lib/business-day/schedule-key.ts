/**
 * The cache identity of a store's business-day schedule. Kept apart from
 * `schedule-service.ts` (which imports the Supabase client) so pure readers of
 * the cache, such as the platform adapter, import no network code.
 */
import { resourceKey, type ResourceQueryKey } from "../backends/query-keys";

export const CUTOFF_SCHEDULE_RESOURCE = "business-day-cutoffs";

export function cutoffScheduleKey(tenantId: string): ResourceQueryKey {
  return resourceKey(CUTOFF_SCHEDULE_RESOURCE, tenantId);
}
