/**
 * "PIN here now" (CONTRACTS W2.3): the receiver types their PIN on the
 * cashier's tablet and the remittance is accepted on the spot.
 *
 * The web route checks the PIN with the same limits and lockouts as the
 * Senior/PWD approver PIN; the app only relays what it answers. The route's
 * own sentence (`error`) is shown as-is, because it already speaks to staff.
 * Never throws.
 */

import { withDeadline } from "../offline/deadline";
import { getAccessTokenBounded } from "../authorized-post";
import { getWebAppUrl } from "../web-app-url";

const PIN_REQUEST_MS = 15_000;
const SESSION_MS = 5_000;

export type PinAcceptOutcome =
  | { kind: "accepted" }
  | { kind: "wrong_pin"; message: string; triesLeft: number | null }
  | { kind: "locked"; message: string; lockedUntil: string | null }
  /** 412: this receiver has no PIN — send it to their phone. */
  | { kind: "no_pin"; message: string }
  /** 409: no longer pending (accepted on their phone meanwhile). */
  | { kind: "not_pending"; message: string }
  | { kind: "failed"; message: string };

export const PIN_COPY = {
  failed: "Couldn't check the PIN. Check the connection and try again.",
  noSession: "Sign in again to use PIN here now.",
} as const;

export interface PinAcceptInput {
  remittanceId: string;
  receiverUserId: string;
  pin: string;
  receivedCents: number;
  note?: string | null;
}

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json: () => Promise<unknown> }>;

function text(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === "string" && body.error.trim() ? body.error : fallback;
}

export function readPinAnswer(status: number, raw: unknown): PinAcceptOutcome {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (status === 200) return { kind: "accepted" };
  if (status === 422) {
    return { kind: "wrong_pin", message: text(body, "That PIN didn't work."), triesLeft: typeof body.triesLeft === "number" ? body.triesLeft : null };
  }
  if (status === 423) {
    return { kind: "locked", message: text(body, "This PIN is locked for now."), lockedUntil: typeof body.lockedUntil === "string" ? body.lockedUntil : null };
  }
  if (status === 412) return { kind: "no_pin", message: text(body, "No PIN set — send to their phone instead.") };
  if (status === 409) return { kind: "not_pending", message: text(body, "This remittance was already handled.") };
  return { kind: "failed", message: text(body, PIN_COPY.failed) };
}

export async function acceptRemittanceByPin(
  input: PinAcceptInput,
  deps: { fetcher?: Fetcher; token?: () => Promise<string | null>; baseUrl?: () => string } = {},
): Promise<PinAcceptOutcome> {
  const token = await (deps.token ?? (() => getAccessTokenBounded(SESSION_MS)))();
  if (!token) return { kind: "failed", message: PIN_COPY.noSession };
  const fetcher = deps.fetcher ?? (fetch as unknown as Fetcher);
  const url = `${(deps.baseUrl ?? getWebAppUrl)()}/api/cash/remittances/${encodeURIComponent(input.remittanceId)}/accept-pin`;
  try {
    const response = await withDeadline(
      fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          receiverUserId: input.receiverUserId,
          pin: input.pin,
          receivedCents: input.receivedCents,
          ...(input.note ? { note: input.note } : {}),
        }),
      }),
      PIN_REQUEST_MS,
    );
    const body = await response.json().catch(() => null);
    return readPinAnswer(response.status, body);
  } catch {
    return { kind: "failed", message: PIN_COPY.failed };
  }
}
