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
