/**
 * When it is safe to hand the checkout tab to the Messenger app.
 *
 * Opening an m.me deep link on a phone backgrounds the browser. A frozen tab
 * abandons whatever request is still in flight, so redirecting while the order
 * row is being written is how an order reaches Messenger and never reaches the
 * database.
 *
 * Two things this must not do, either of which would be a worse bug:
 *  - trap a customer behind a save that hangs, and
 *  - withhold the Messenger message when the save has failed, since that
 *    message is the merchant's only remaining copy of the order.
 */

/** How long the confirmation screen will wait for a save before giving up on it. */
export const REDIRECT_WAIT_CEILING_MS = 8000

export type RedirectWaitOutcome = 'saved' | 'failed' | 'timed-out' | 'untracked'

/**
 * Resolves when the save settles, or at the ceiling — never throws, so a
 * rejected save cannot take the redirect down with it.
 */
export async function awaitSaveBeforeRedirect(
  save: Promise<unknown> | null | undefined,
  options: { ceilingMs?: number } = {}
): Promise<RedirectWaitOutcome> {
  if (!save) return 'untracked'

  const ceilingMs = options.ceilingMs ?? REDIRECT_WAIT_CEILING_MS

  let timer: ReturnType<typeof setTimeout> | undefined
  const ceiling = new Promise<RedirectWaitOutcome>(resolve => {
    timer = setTimeout(() => resolve('timed-out'), ceilingMs)
  })

  try {
    return await Promise.race([
      save.then<RedirectWaitOutcome, RedirectWaitOutcome>(() => 'saved', () => 'failed'),
      ceiling,
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
