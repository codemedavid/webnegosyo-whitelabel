/**
 * Run best-effort follow-up work AFTER the response has been sent.
 *
 * A saved order is followed by work the customer is not waiting for: the
 * merchant's email notification, the Loyverse receipt push, the Regulars-list
 * capture. Every one of those is best-effort (it never changes the answer) and
 * every one of them is a network call — awaiting them made the customer wait
 * for PostHog, Loyverse and five customer-profile queries before checkout could
 * move on to the tracking page.
 *
 * `after()` keeps the function alive until the task settles (Vercel
 * `waitUntil`), so the work still completes. Outside a request scope (a script,
 * a unit test) `after()` throws; the task then runs inline exactly as it did
 * before this helper existed, so no caller can lose the work.
 *
 * Never throws: a failed follow-up is logged, never surfaced.
 */

export type AfterScheduler = (task: () => Promise<void>) => void

async function scheduleWithNext(task: () => Promise<void>): Promise<void> {
  const { after } = await import('next/server')
  after(task)
}

function guard(label: string, task: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await task()
    } catch (error) {
      console.error(`[after-response] ${label} failed:`, error instanceof Error ? error.message : error)
    }
  }
}

export async function runAfterResponse(
  label: string,
  task: () => Promise<void>,
  schedule?: AfterScheduler,
): Promise<void> {
  const guarded = guard(label, task)
  try {
    if (schedule) schedule(guarded)
    else await scheduleWithNext(guarded)
  } catch {
    // No request scope to defer behind: do the work now, as before.
    await guarded()
  }
}
