/**
 * The store's business-day cutoff schedule (`business_day_cutoffs`) as the app
 * reads it.
 *
 * The table is a STORE SETTING on the platform Supabase, so it is read the same
 * way whatever backend holds the store's orders (platform, Convex, tenant
 * database). Every member of the store may read it (RLS); only
 * `set_business_day_cutoff` writes it.
 *
 * `fetchCutoffSchedule` throws when the read fails; the hook
 * (`use-trading-day.ts`) decides what a screen does about it. A table that is
 * not there yet means no store can have set a cutoff, so it answers midnight
 * (the web reader, `src/lib/business-day/read-schedule.ts`, does the same).
 *
 * The key and fetcher are exported so the offline download
 * (`lib/offline/register-pack.ts`) can save the schedule next to the menu.
 */
import { supabase } from "../supabase";
import { MIDNIGHT_SCHEDULE, parseCutoffSchedule, type CutoffSchedule } from "./trading-day";

export { CUTOFF_SCHEDULE_RESOURCE, cutoffScheduleKey } from "./schedule-key";

/** A store changes its cutoff a handful of times in its life; this many rows is a bug. */
export const CUTOFF_ROW_LIMIT = 500;

/** PostgREST "no such table in the schema cache" and Postgres "undefined_table". */
const MISSING_TABLE_CODES = new Set(["PGRST205", "42P01"]);

interface ReadError {
  code?: string;
  message?: string;
}

export async function fetchCutoffSchedule(tenantId: string): Promise<CutoffSchedule> {
  const { data, error } = await supabase
    .from("business_day_cutoffs")
    .select("effective_from, cutoff_minutes")
    .eq("tenant_id", tenantId)
    .order("effective_from", { ascending: true })
    .limit(CUTOFF_ROW_LIMIT);
  if (error) {
    const readError = error as ReadError;
    if (readError.code && MISSING_TABLE_CODES.has(readError.code)) return MIDNIGHT_SCHEDULE;
    throw new Error(readError.message ?? "Couldn't load the store's business day setting");
  }
  return parseCutoffSchedule(data ?? []);
}
