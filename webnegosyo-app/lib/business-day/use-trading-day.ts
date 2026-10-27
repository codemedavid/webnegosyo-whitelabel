/**
 * The store's business day on a screen: the schedule, today's key and window,
 * and whether the screen is looking at the real setting or at a midnight
 * stand-in.
 *
 * The schedule is one tiny read per store, kept on the shared cache for the
 * session and on disk (`offlineSnapshot`), so a register that opens with no
 * signal still files a 1 AM sale under the right day.
 *
 * What a screen does with `isFallback` depends on what it is:
 * - read-only displays (Home, Reports) use the midnight schedule and show a
 *   note: "Showing midnight-to-midnight; couldn't load your business day
 *   setting."
 * - writers and freezers (day close, remit) must refuse while `isFallback` or
 *   `isLoading` is true, never act on the stand-in.
 *
 * "Today" moves when the BUSINESS day changes (at the cutoff, not at
 * midnight), and only then, so queries built from it are not rebuilt every
 * minute (the same rule as `useBusinessDayAnchor`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuthStore } from "../../stores/auth-store";
import { useResource } from "../query/use-resource";
import { cutoffScheduleKey, fetchCutoffSchedule } from "./schedule-service";
import { MIDNIGHT_SCHEDULE, parseCutoffSchedule, tradingDayOf, tradingDayWindow, type CutoffSchedule } from "./trading-day";

const DAY_CHECK_INTERVAL_MS = 60_000;
/** A cutoff change only ever applies from a future day; ten minutes is plenty fresh. */
const SCHEDULE_STALE_MS = 10 * 60_000;

export interface CutoffScheduleState {
  /** Never undefined: midnight until (and unless) the real schedule loads. */
  schedule: CutoffSchedule;
  /** The read failed (or held rows it could not trust) and `schedule` is the midnight stand-in. */
  isFallback: boolean;
  isLoading: boolean;
}

export interface TradingDayState extends CutoffScheduleState {
  /** Today's business day, YYYY-MM-DD. */
  todayKey: string;
  /** An instant inside today's business day; moves only when the day changes. */
  anchorMs: number;
  /** Today's half-open [startMs, endMs). */
  startMs: number;
  endMs: number;
}

/** What a screen may believe about the schedule, given the cache's answer. Pure. */
export function resolveScheduleState(
  data: unknown,
  isLoading: boolean,
  error: string | null
): CutoffScheduleState {
  if (data !== undefined) {
    try {
      // The disk snapshot is plain JSON, so it is checked again on the way in.
      return { schedule: parseCutoffSchedule(data), isFallback: false, isLoading: false };
    } catch {
      return { schedule: MIDNIGHT_SCHEDULE, isFallback: true, isLoading: false };
    }
  }
  if (isLoading) return { schedule: MIDNIGHT_SCHEDULE, isFallback: false, isLoading: true };
  return { schedule: MIDNIGHT_SCHEDULE, isFallback: error !== null, isLoading: false };
}

export function tradingDayKeyAt(atMs: number, schedule: CutoffSchedule): string {
  return tradingDayOf(new Date(atMs).toISOString(), schedule);
}

/** The schedule for one store (null = no store in scope: midnight, idle). */
export function useCutoffSchedule(tenantId: string | null): CutoffScheduleState {
  const fetcher = useCallback(() => fetchCutoffSchedule(tenantId as string), [tenantId]);
  const { data, isLoading, error } = useResource<CutoffSchedule>(
    tenantId ? cutoffScheduleKey(tenantId) : null,
    fetcher,
    { offlineSnapshot: true, staleTime: SCHEDULE_STALE_MS }
  );
  return useMemo(() => resolveScheduleState(data, isLoading, error), [data, isLoading, error]);
}

/** The signed-in store's business day (impersonation included). */
export function useTradingDay(): TradingDayState {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const scheduleState = useCutoffSchedule(tenantId);
  const { schedule } = scheduleState;
  const [anchorMs, setAnchorMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const nowMs = Date.now();
      setAnchorMs((current) =>
        tradingDayKeyAt(current, schedule) === tradingDayKeyAt(nowMs, schedule) ? current : nowMs
      );
    }, DAY_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [schedule]);

  return useMemo(() => {
    const todayKey = tradingDayKeyAt(anchorMs, schedule);
    const window = tradingDayWindow(todayKey, schedule);
    return {
      ...scheduleState,
      todayKey,
      anchorMs,
      startMs: Date.parse(window.startIso),
      endMs: Date.parse(window.endIso),
    };
  }, [scheduleState, schedule, anchorMs]);
}
