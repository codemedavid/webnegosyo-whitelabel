/**
 * A bound on every platform-Supabase read and write.
 *
 * All adapter calls await supabase-js behind the shared GoTrue auth lock, and a
 * background token refresh that stalls there has frozen a live register once
 * already (the POS second-checkout freeze). `authorized-post.ts` bounds the
 * web-app POSTs; this bounds the PostgREST path, so a hang becomes an error a
 * screen can show and a cashier can retry instead of a spinner that never ends.
 */

import { reportOutcome } from "../offline/connectivity";

export const PLATFORM_CALL_TIMEOUT_MS = 12000;

export async function withPlatformTimeout<T>(
  work: Promise<T>,
  callLabel: string,
  timeoutMs: number = PLATFORM_CALL_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `The request timed out (${callLabel}). Check your connection and try again.`
            )
          );
        }, timeoutMs);
      }),
    ]);
    // Every platform round trip is a free connectivity sample: the register
    // learns it is offline from the first read that fails and back from the
    // first that succeeds, without any probe of its own (lib/offline).
    reportOutcome(undefined);
    return result;
  } catch (error) {
    reportOutcome(error);
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface PlatformDeadlineOptions {
  /** The caller's own cancellation — the query cache's, for a read it replaced. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * `withPlatformTimeout` for work that can be CANCELLED, which every read can.
 *
 * The race above only stops waiting: the request it bounded stays on the wire.
 * For a read that is the wrong half of a timeout — the next poll, focus or
 * realtime invalidation starts another copy behind it, so a slow database met
 * a growing queue of abandoned reads from every device, each holding one of
 * the few connections a phone opens to a host while the fresh read queued
 * behind it and timed out in turn. Here the deadline and the caller's signal
 * both abort the work itself.
 *
 * A cancellation is not reported as a connectivity outcome: the cache
 * replacing a read says nothing about the network, and reading its AbortError
 * as "offline" would send the register's next sale to the offline queue.
 */
export async function withPlatformDeadline<T>(
  start: (signal: AbortSignal) => Promise<T>,
  callLabel: string,
  options: PlatformDeadlineOptions = {}
): Promise<T> {
  const { signal: callerSignal, timeoutMs = PLATFORM_CALL_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (callerSignal?.aborted) cancel();
  callerSignal?.addEventListener("abort", cancel);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      start(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          cancel();
          reject(
            new Error(
              `The request timed out (${callLabel}). Check your connection and try again.`
            )
          );
        }, timeoutMs);
      }),
    ]);
    reportOutcome(undefined);
    return result;
  } catch (error) {
    if (!callerSignal?.aborted) reportOutcome(error);
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancel);
  }
}
