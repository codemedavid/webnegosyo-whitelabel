/**
 * Pull-to-refresh that refetches, and is seen to.
 *
 * Five screens used to acknowledge the gesture with a 600 ms spinner that
 * refetched nothing. Now the gesture awaits every query the screen holds; the
 * spinner stays up for at least a beat so an instant cache hit still reads as
 * "refreshed" rather than "ignored".
 */

export const MIN_REFRESH_SPINNER_MS = 400;

export function minSpinner(ms: number = MIN_REFRESH_SPINNER_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshWithMinSpinner(
  refetches: ReadonlyArray<() => Promise<void>>,
  setRefreshing: (isRefreshing: boolean) => void,
  minMs: number = MIN_REFRESH_SPINNER_MS
): Promise<void> {
  setRefreshing(true);
  try {
    await Promise.all([...refetches.map((refetch) => refetch()), minSpinner(minMs)]);
  } catch (e: unknown) {
    // A failed read already surfaces through the query's own error state; the
    // gesture itself must never leave the spinner stuck.
    console.warn("[pull-to-refresh] refetch failed:", e instanceof Error ? e.message : e);
  } finally {
    setRefreshing(false);
  }
}
