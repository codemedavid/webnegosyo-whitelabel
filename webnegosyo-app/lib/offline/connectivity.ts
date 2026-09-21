/**
 * What the app currently believes about its connection.
 *
 * There is deliberately no native network module behind this (none is
 * installed, and adding one means a store build rather than an OTA update).
 * The belief comes from two sources instead:
 *
 * 1. Every platform round trip reports its outcome (`reportOutcome`), so the
 *    register learns it is offline from the first read that fails and learns
 *    it is back from the first one that succeeds — no extra traffic while the
 *    till is busy.
 * 2. While the belief is anything but "online", a small health probe runs on
 *    an interval and on foreground (`use-connectivity.ts`), so an idle till
 *    notices the connection returning and can replay its queued sales.
 *
 * "unknown" is the cold-start state and is treated as online by every caller:
 * the register always TRIES the server first and only falls back on failure.
 * Pure over listeners; the React binding lives in `use-connectivity.ts`.
 */

import { isNetworkFailure } from "./network-error";

export type ConnectivityStatus = "online" | "offline" | "unknown";

export interface ConnectivityState {
  status: ConnectivityStatus;
  /** Epoch ms of the last status CHANGE; 0 before the first report. */
  changedAt: number;
}

const INITIAL_STATE: ConnectivityState = { status: "unknown", changedAt: 0 };

let state: ConnectivityState = INITIAL_STATE;
const listeners = new Set<() => void>();

function transition(status: ConnectivityStatus, now: number): void {
  if (state.status === status) return;
  state = { status, changedAt: now };
  listeners.forEach((listener) => listener());
}

export function getConnectivity(): ConnectivityState {
  return state;
}

export function subscribeConnectivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True only when a failure has been SEEN; "unknown" is not offline. */
export function isOffline(): boolean {
  return state.status === "offline";
}

export function reportOnline(now: number = Date.now()): void {
  transition("online", now);
}

export function reportOffline(now: number = Date.now()): void {
  transition("offline", now);
}

/**
 * A request settled: a network failure means offline, anything else — a
 * success or a server refusal — means the server answered, so online.
 */
export function reportOutcome(error: unknown, now: number = Date.now()): void {
  if (error === undefined || error === null) {
    reportOnline(now);
    return;
  }
  if (isNetworkFailure(error)) reportOffline(now);
  else reportOnline(now);
}

/** Test seam: back to cold start. */
export function resetConnectivityForTests(): void {
  state = INITIAL_STATE;
  listeners.clear();
}

// ── Reachability probe ──

/** How often an offline till asks whether the connection is back. */
export const PROBE_INTERVAL_MS = 10_000;
/** A probe that takes longer than this is a "no". */
export const PROBE_TIMEOUT_MS = 4_000;

export interface ProbeDeps {
  url: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * One bounded GET; true when the server answered at all (any HTTP status).
 * Never throws — an exception is just "no".
 */
export async function probeReachability(deps: ProbeDeps): Promise<boolean> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? PROBE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchImpl(deps.url, {
      method: "GET",
      headers: deps.headers,
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The interval only runs while the belief is not "online". */
export function shouldPollReachability(status: ConnectivityStatus): boolean {
  return status !== "online";
}
