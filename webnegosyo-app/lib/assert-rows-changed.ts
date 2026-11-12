/**
 * Did the write actually change a row?
 *
 * Row-level security refuses an UPDATE or DELETE silently: the statement
 * succeeds, matches zero rows and returns no error. A writer that checks only
 * `error` reports "saved" for a write the database turned away. Ask the
 * database what it changed (`.select("id")` after the write, or
 * `{ count: "exact" }`) and pass the response through one of these:
 *
 *   // zero rows is always a failure
 *   const result = assertRowsChanged(
 *     await supabase.from("vouchers").update({ is_active }).eq("id", id).select("id"),
 *   );
 *   if (!result.ok) throw writeFailure(result);
 *
 *   // zero rows is fine when the row is already gone (the second tap of a double tap)
 *   const result = await assertRowsChangedOrGone(
 *     await supabase.from("menu_items").delete().eq("id", id).select("id"),
 *     () => supabase.from("menu_items").select("id").eq("id", id).limit(1),
 *   );
 *   if (!result.ok) throw writeFailure(result);
 *
 * The app's copy of the web's `src/platform/db/assert-rows-changed.ts` and
 * `assert-rows-changed-or-gone.ts` (the app cannot import from `src/`). Same
 * rules; keep them in step.
 */

export interface WriteError {
  message: string;
  code?: string;
}

/** The part of a Supabase write response this needs. */
export interface WriteResponse {
  /** Rows from `.select()`, one row from `.single()` / `.maybeSingle()`, or null. */
  data?: unknown;
  error: WriteError | null;
  /** Set when the write passed `{ count: "exact" }`. */
  count?: number | null;
  /** HTTP status; 204 means the write did not ask for its rows back. */
  status?: number;
}

export type RowsChangedResult =
  | { ok: true; count: number }
  | { ok: false; reason: "error"; error: WriteError }
  /** Zero rows: row-level security refused the write, or its filter matched nothing. */
  | { ok: false; reason: "no-rows-changed" }
  /** The write asked for neither rows nor a count, so nothing can be said about it. */
  | { ok: false; reason: "not-counted" };

export type RowsChangedOrGoneResult =
  /** `count` is zero when there was nothing left to change. */
  | { ok: true; count: number }
  | { ok: false; reason: "error"; error: WriteError }
  /** Zero rows changed and the rows the write was aimed at are still there. */
  | { ok: false; reason: "refused" }
  | { ok: false; reason: "not-counted" };

/** What the person who made the change is told when the database changed nothing. */
export const NOTHING_CHANGED_MESSAGE = "Nothing was changed. You may not have access to do this.";

const NO_CONTENT = 204;

function changedCount({ data, count, status }: WriteResponse): number | null {
  if (Array.isArray(data)) return data.length;
  if (data !== null && data !== undefined) return 1;
  if (typeof count === "number") return count;
  // `.select().maybeSingle()` with no row: the rows were asked for and there were none.
  if (status !== undefined && status !== NO_CONTENT) return 0;
  return null;
}

export function assertRowsChanged(response: WriteResponse): RowsChangedResult {
  if (response.error) return { ok: false, reason: "error", error: response.error };

  const count = changedCount(response);
  if (count === null) return { ok: false, reason: "not-counted" };
  if (count === 0) return { ok: false, reason: "no-rows-changed" };
  return { ok: true, count };
}

/**
 * As `assertRowsChanged`, for a write where zero rows can be a harmless no-op.
 * After a zero-row write `remaining` looks for the rows it was aimed at (one is
 * enough: `.limit(1)`). Still there = the write was refused; gone = success.
 */
export async function assertRowsChangedOrGone(
  response: WriteResponse,
  remaining: () => PromiseLike<{ data: unknown[] | null; error: WriteError | null }>,
): Promise<RowsChangedOrGoneResult> {
  const changed = assertRowsChanged(response);
  if (changed.ok || changed.reason !== "no-rows-changed") return changed;

  const { data, error } = await remaining();
  if (error) return { ok: false, reason: "error", error };
  return (data ?? []).length > 0 ? { ok: false, reason: "refused" } : { ok: true, count: 0 };
}

/**
 * What a throwing writer throws for a failed result: the database error as it
 * is, anything else as an Error saying nothing was changed.
 */
export function writeFailure(result: { ok: false; reason: string; error?: WriteError }): WriteError | Error {
  return result.error ?? new Error(NOTHING_CHANGED_MESSAGE);
}
