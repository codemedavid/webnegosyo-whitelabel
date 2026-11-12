/**
 * The browser history entry a page-like payment step (full screen, its own
 * screen) adds while it is open, so the phone's Back button closes the step
 * instead of leaving the checkout.
 *
 * The entry is OURS only while the address bar still shows the URL we pushed
 * it on and no Back has left it. The marker in `history.state` alone can't
 * decide that: Next.js copies the current state onto the next page it pushes
 * (so the QR page would carry it), and a server action or refresh replaces the
 * state without it (createOrderAction runs while the step is open).
 *
 * Whoever closes the step without the customer pressing Back (a saved order,
 * a refusal, the QR handoff) gives the entry back first, so the stack ends as
 * it was before the step opened: `releasePaymentStepEntry()` before any
 * navigation, and the step's unmount does it on its own (one tick later, so
 * React's dev double effect can take it back).
 */

const HISTORY_MARK = 'wnPaymentStep'
/** How long to wait for the browser to report the Back we asked for. */
const POP_TIMEOUT_MS = 600

interface OwnedEntry {
  token: string
  href: string
}

let owned: OwnedEntry | null = null
let scheduled: { timer: ReturnType<typeof setTimeout>; done: Promise<void>; resolve: () => void } | null = null
let popping: Promise<void> | null = null

function markOnCurrentEntry(): unknown {
  const state = window.history.state as Record<string, unknown> | null
  return state ? state[HISTORY_MARK] : undefined
}

/** Still on the entry we pushed (same URL, no Back since). */
export function isOnPaymentStepEntry(): boolean {
  return owned !== null && window.location.href === owned.href
}

/**
 * The step opened (or re-ran): push our entry unless we are already on it.
 * Takes back a give-back the step's own cleanup scheduled a moment ago.
 */
export function holdPaymentStepEntry(): void {
  if (scheduled) {
    clearTimeout(scheduled.timer)
    scheduled.resolve()
    scheduled = null
  }
  if (isOnPaymentStepEntry()) return
  const token = Math.random().toString(36).slice(2)
  // Next.js's patched pushState keeps its own router state on the entry.
  window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_MARK]: token }, '')
  owned = { token, href: window.location.href }
}

/**
 * A popstate while the step is open: true when it left our entry (the
 * customer pressed Back), false when it landed on our entry again (Forward) or
 * we were popping it ourselves.
 */
export function didLeavePaymentStepEntry(): boolean {
  if (!owned) return false
  if (window.location.href === owned.href && markOnCurrentEntry() === owned.token) return false
  owned = null
  return true
}

function popOwnedEntry(): Promise<void> {
  if (popping) return popping
  if (!isOnPaymentStepEntry()) {
    owned = null
    return Promise.resolve()
  }
  owned = null
  popping = new Promise<void>((resolve) => {
    const finish = () => {
      window.removeEventListener('popstate', finish)
      clearTimeout(timer)
      popping = null
      resolve()
    }
    const timer = setTimeout(finish, POP_TIMEOUT_MS)
    window.addEventListener('popstate', finish)
    window.history.back()
  })
  return popping
}

/** Give our entry back now; resolves once the browser is on the entry before it. */
export function releasePaymentStepEntry(): Promise<void> {
  if (scheduled) {
    clearTimeout(scheduled.timer)
    const { resolve } = scheduled
    scheduled = null
    return popOwnedEntry().then(resolve)
  }
  return popOwnedEntry()
}

/**
 * Run a navigation once our entry is given back: straight away when the step
 * never held one (sheet, pop-up, no step), else after the pop. Returns a
 * cancel for effects.
 */
export function afterPaymentStepEntryReleased(run: () => void): () => void {
  if (!owned && !scheduled && !popping) {
    run()
    return () => undefined
  }
  let isCancelled = false
  void releasePaymentStepEntry().then(() => {
    if (!isCancelled) run()
  })
  return () => {
    isCancelled = true
  }
}

/** The step unmounted without a Back: give the entry back a tick later. */
export function scheduleReleasePaymentStepEntry(): void {
  if (!owned || scheduled) return
  let resolve: () => void = () => undefined
  const done = new Promise<void>((settle) => {
    resolve = settle
  })
  const timer = setTimeout(() => {
    scheduled = null
    void popOwnedEntry().then(resolve)
  }, 0)
  scheduled = { timer, done, resolve }
}

/** Tests only: forget every entry. */
export function resetPaymentStepHistoryForTests(): void {
  if (scheduled) clearTimeout(scheduled.timer)
  scheduled = null
  owned = null
  popping = null
}
