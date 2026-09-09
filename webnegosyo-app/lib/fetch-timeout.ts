/**
 * `fetch` with a deadline.
 *
 * The push-token writes to a tenant's Convex deployment go through raw
 * `fetch`; a deployment that never answers — or a socket the OS suspended
 * behind the app's back — would otherwise hold the promise open for the life
 * of the process. React Native has no default request timeout.
 */

export const FETCH_TIMEOUT_MS = 10_000;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS,
  fetchImpl: FetchLike = fetch
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetchImpl(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}
