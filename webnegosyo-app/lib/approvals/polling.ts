/**
 * When the app re-reads a request, and how an API answer becomes a query
 * result — pure. The requester's card and the review screen poll every 10 s
 * while a request is still moving (pending → approved → executing), only
 * while their screen is in view, and never for longer than MAX_POLL_MS: a
 * request expires in 30 minutes by default, so 35 is a safe ceiling.
 */
import type { ApiResult } from "./api";
import { POLL_INTERVAL_MS, shouldKeepPolling } from "./state";
import type { ApprovalRequestView } from "./types";

export const MAX_POLL_MS = 35 * 60 * 1000;

export interface PollContext {
  isFocused: boolean;
  /** Epoch ms the screen started watching. */
  startedAt: number;
  now: number;
}

export function pollIntervalFor(requests: readonly ApprovalRequestView[], context: PollContext): number | false {
  if (!context.isFocused) return false;
  if (context.now - context.startedAt > MAX_POLL_MS) return false;
  return requests.some((request) => shouldKeepPolling(request)) ? POLL_INTERVAL_MS : false;
}

export interface ApprovalsError {
  message: string;
  /** 0 = never reached the server. */
  status: number;
  code: string | null;
}

const ERROR_FIELDS = "__approvals";

/** Data on success; otherwise throws an Error that carries the server's words and code. */
export function unwrapApiResult<T>(result: ApiResult<T>): T {
  if (result.ok) return result.data;
  throw Object.assign(new Error(result.error), {
    [ERROR_FIELDS]: { message: result.error, status: result.status, code: result.code ?? null } satisfies ApprovalsError,
  });
}

/** The server's refusal from a thrown query/mutation error (unknown throws read as a generic failure). */
export function toApprovalsError(error: unknown): ApprovalsError {
  if (error && typeof error === "object" && ERROR_FIELDS in error) {
    return (error as Record<typeof ERROR_FIELDS, ApprovalsError>)[ERROR_FIELDS];
  }
  if (error instanceof Error) return { message: error.message, status: 0, code: null };
  return { message: "Something went wrong. Try again.", status: 0, code: null };
}
