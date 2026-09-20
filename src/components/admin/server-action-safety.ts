/**
 * Guarded invocation and plain-language classification for admin Server Action
 * calls.
 *
 * A Server Action call is an HTTP POST that Next.js makes on the client's
 * behalf. When the answer is not an RSC payload — the router navigated out from
 * under an in-flight action, the session expired and middleware redirected the
 * POST, the platform returned its own error page — Next throws
 * `An unexpected response was received from the server.` from inside its own
 * reducer (`server-action-reducer.js`). When the tab is backgrounded or the
 * radio drops, WebKit rejects the same POST with `TypeError: Load failed`.
 *
 * Neither is something a caller can predict, and neither is a programming
 * error, so every call site must handle the rejection. A call site that merely
 * `await`s the action inside an event handler, a `startTransition(async …)`
 * body, or a dropped promise sends that rejection straight to
 * `window.onunhandledrejection`, where it is reported as an unhandled crash and
 * the merchant is told nothing.
 *
 * `runServerAction` is the seam: it never rejects, and it returns a failure
 * *kind* so a caller can tell "the tab was backgrounded, nothing was saved"
 * apart from "the server refused this". Nothing here silences an error — every
 * outcome carries a message the caller is expected to show.
 */

/** Thrown by Next's server-action reducer when the POST answer is not RSC. */
export const UNEXPECTED_ACTION_RESPONSE =
  'An unexpected response was received from the server.'

/** Thrown by Next when the deployment no longer knows this action id. */
const UNRECOGNIZED_ACTION_PATTERN = /^Server Action .+ was not found on the server/

/**
 * Fetch rejections that mean "the request never completed", not "the server
 * said no". WebKit reports every one of them as a bare `TypeError`, so the
 * message is the only discriminator available.
 */
const TRANSPORT_FAILURE_PATTERN =
  /^(Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.?|The network connection was lost\.?|The Internet connection appears to be offline\.?|cancelled|canceled)$/i

export type ActionFailureKind =
  /** The request was cut off — a backgrounded tab, a navigation, or no network. */
  | 'aborted'
  /** The server answered, but not with an action payload: stale page or session. */
  | 'stale-page'
  /** The request could not reach the server while the page was live and online. */
  | 'network'
  /** Anything else, including errors the action itself threw. */
  | 'unknown'

export interface ClientEnvironment {
  readonly isOnline: boolean
  readonly visibility: 'visible' | 'hidden'
}

export type ServerActionOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly kind: ActionFailureKind; readonly message: string }

const ACTION_FAILURE_MESSAGES: Readonly<Record<ActionFailureKind, string>> = {
  aborted:
    'The request stopped before it finished — the page was in the background or moved on. Nothing was saved. Try again.',
  'stale-page':
    'The page moved on before the server answered, or your sign-in expired. Reload the page and try again.',
  network: 'Could not reach the server. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
}

/**
 * Read the browser conditions that decide whether a transport failure was an
 * abort. Every accessor is guarded: this runs on the server during SSR, and a
 * privacy-hardened browser can throw on either property.
 */
export function readClientEnvironment(): ClientEnvironment {
  if (typeof window === 'undefined') return { isOnline: true, visibility: 'visible' }
  let isOnline = true
  let visibility: ClientEnvironment['visibility'] = 'visible'
  try {
    isOnline = navigator.onLine !== false
  } catch {
    // An unreadable connection state must not change how an error is reported.
  }
  try {
    visibility = document.visibilityState === 'hidden' ? 'hidden' : 'visible'
  } catch {
    // Same: fall back to "visible", the conservative answer, which keeps a
    // genuine failure visible rather than filing it as a harmless abort.
  }
  return { isOnline, visibility }
}

const errorName = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name?: unknown }).name ?? '')
    : ''

const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : ''

/** Decide what kind of failure a rejected Server Action promise represents. */
export function classifyActionFailure(
  error: unknown,
  env: ClientEnvironment = readClientEnvironment(),
): ActionFailureKind {
  if (errorName(error) === 'AbortError') return 'aborted'

  const message = errorMessage(error).trim()
  if (message === UNEXPECTED_ACTION_RESPONSE) return 'stale-page'
  if (UNRECOGNIZED_ACTION_PATTERN.test(message)) return 'stale-page'

  if (TRANSPORT_FAILURE_PATTERN.test(message)) {
    // A hidden tab or a dropped connection means the browser tore the request
    // down. That is not a defect to show as a crash — but it is still a write
    // that did not land, so the caller is told, not left guessing.
    return env.visibility === 'hidden' || !env.isOnline ? 'aborted' : 'network'
  }

  return 'unknown'
}

/** A merchant-readable explanation for a rejected Server Action promise. */
export function describeActionError(
  error: unknown,
  env: ClientEnvironment = readClientEnvironment(),
): string {
  const kind = classifyActionFailure(error, env)
  if (kind !== 'unknown') return ACTION_FAILURE_MESSAGES[kind]
  const message = errorMessage(error).trim()
  return message === '' ? ACTION_FAILURE_MESSAGES.unknown : message
}

/**
 * A refresh started while the tab is hidden is an RSC fetch the browser will
 * cancel on suspend; the aborted stream then surfaces as a full-page error
 * boundary rather than as the background event it was.
 */
export function shouldDeferRefresh(visibility: ClientEnvironment['visibility']): boolean {
  return visibility === 'hidden'
}

/**
 * Invoke a Server Action so that it can never reject. The returned outcome
 * always carries either the action's value or a classified, displayable
 * failure — callers must not ignore it.
 */
export async function runServerAction<T>(
  invoke: () => Promise<T>,
): Promise<ServerActionOutcome<T>> {
  try {
    return { ok: true, value: await invoke() }
  } catch (error) {
    // Read the environment now, not at call time: whether the tab was hidden
    // is only meaningful at the moment the request died.
    const env = readClientEnvironment()
    return { ok: false, kind: classifyActionFailure(error, env), message: describeActionError(error, env) }
  }
}
