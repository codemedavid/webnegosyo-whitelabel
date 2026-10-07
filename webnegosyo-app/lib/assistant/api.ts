/**
 * The Owl's non-streaming calls to the web app: past chats and the owner's
 * Confirm / Cancel tap. Authenticated with the signed-in user's own token,
 * bounded like every other app → web call (see authorized-post.ts for why a
 * plain `getSession()` must never be awaited without a deadline).
 */

import { getAccessTokenBounded } from "../authorized-post";
import { getWebAppUrl } from "../web-app-url";
import { readRefusal } from "./presentation";
import type { AssistantMessage } from "./types";

export const ASSISTANT_REQUEST_TIMEOUT_MS = 20_000;
/** Confirming runs the real writer (a combo, a voucher…) — give it the server's own budget. */
export const ASSISTANT_DECISION_TIMEOUT_MS = 60_000;
const SESSION_TIMEOUT_MS = 8_000;

export const SIGNED_OUT_ERROR = "Please sign in again.";
export const DECISION_UNKNOWN_ERROR =
  "Couldn’t hear back from the server. Open this chat again from Past chats to see whether it went through.";

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface DecisionResult {
  status?: string;
  message?: string;
  error?: string;
  link?: { label: string; path: string } | null;
}

export class AssistantRequestError extends Error {}

export async function assistantToken(): Promise<string> {
  const token = await getAccessTokenBounded(SESSION_TIMEOUT_MS);
  if (!token) throw new AssistantRequestError(SIGNED_OUT_ERROR);
  return token;
}

async function requestJson(path: string, init: RequestInit, timeoutMs: number): Promise<{ ok: boolean; status: number; body: unknown }> {
  const token = await assistantToken();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AssistantRequestError("Could not reach the server. Check your connection and try again."));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      fetch(`${getWebAppUrl()}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      }),
      expiry,
    ]);
    const body = await Promise.race([response.json().catch(() => ({})), expiry]);
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function listConversations(tenantId: string): Promise<ConversationSummary[]> {
  const { ok, status, body } = await requestJson(
    `/api/assistant/conversations?tenantId=${encodeURIComponent(tenantId)}`,
    { method: "GET" },
    ASSISTANT_REQUEST_TIMEOUT_MS,
  );
  const conversations = (body as { conversations?: unknown }).conversations;
  if (!ok || !Array.isArray(conversations)) throw new AssistantRequestError(ok ? "Could not load your chats." : readRefusal(body, status));
  return conversations as ConversationSummary[];
}

export async function loadConversation(tenantId: string, conversationId: string): Promise<AssistantMessage[]> {
  const { ok, status, body } = await requestJson(
    `/api/assistant/conversations?tenantId=${encodeURIComponent(tenantId)}&id=${encodeURIComponent(conversationId)}`,
    { method: "GET" },
    ASSISTANT_REQUEST_TIMEOUT_MS,
  );
  const messages = (body as { messages?: unknown }).messages;
  if (!ok || !Array.isArray(messages)) throw new AssistantRequestError(ok ? "Could not open that chat." : readRefusal(body, status));
  return messages as AssistantMessage[];
}

/** Never throws: the confirm card always gets an answer to show. */
export async function decideAction(tenantId: string, actionId: string, decision: "confirm" | "cancel"): Promise<DecisionResult> {
  try {
    const { body } = await requestJson(
      `/api/assistant/actions/${encodeURIComponent(actionId)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, decision }) },
      ASSISTANT_DECISION_TIMEOUT_MS,
    );
    return body && typeof body === "object" ? (body as DecisionResult) : {};
  } catch (error) {
    if (error instanceof AssistantRequestError && error.message === SIGNED_OUT_ERROR) return { error: SIGNED_OUT_ERROR };
    // The tap may have reached the server before the line dropped, so this
    // must not claim "nothing was changed": reopening the chat shows the outcome.
    return { error: DECISION_UNKNOWN_ERROR };
  }
}
