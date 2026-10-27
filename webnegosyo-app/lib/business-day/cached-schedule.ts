/**
 * The business-day schedule for code that is not a React hook (the platform
 * adapter's "today" reads), from the app's shared query cache.
 *
 * Screens load the schedule through `useTradingDay`, which fills the cache
 * (and the offline pack saves it). A read that runs before that, or for a
 * store whose schedule was never loaded, answers midnight, the pre-cutoff
 * behaviour, never a guess. Display reads only: a writer that files money
 * under a day must use `fetchCutoffSchedule` and refuse on failure.
 */
import { queryClient } from "../query/query-client";
import { cutoffScheduleKey } from "./schedule-key";
import { MIDNIGHT_SCHEDULE, parseCutoffSchedule, type CutoffSchedule } from "./trading-day";

export interface ScheduleCache {
  getQueryData(key: readonly unknown[]): unknown;
}

export function cachedCutoffSchedule(
  tenantId: string | null | undefined,
  cache: ScheduleCache = queryClient
): CutoffSchedule {
  if (!tenantId) return MIDNIGHT_SCHEDULE;
  const data = cache.getQueryData(cutoffScheduleKey(tenantId));
  if (data === undefined) return MIDNIGHT_SCHEDULE;
  try {
    return parseCutoffSchedule(data);
  } catch {
    return MIDNIGHT_SCHEDULE;
  }
}
