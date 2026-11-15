/**
 * `POST /api/messenger/chat` from the app, with the staff member's own token
 * (the web route checks, as them, that they may read this chat). Never throws:
 * every outcome comes back as a value the chat screen can show.
 */

import { supabase } from "../supabase";
import { getWebAppUrl } from "../web-app-url";
import { parseStaffChatTools, type PreviewMessage, type StaffCard, type StaffChatTools } from "./staff-chat";

const TIMEOUT_MS = 15_000;
const OFFLINE = "Could not reach the server. Check your connection and try again.";

export type StaffChatResult<T> = { ok: true; value: T } | { ok: false; error: string; reason?: string; status?: number };

async function post(payload: Record<string, unknown>): Promise<StaffChatResult<Record<string, unknown>>> {
  let token: string | undefined;
  try {
    token = (await supabase.auth.getSession()).data.session?.access_token;
  } catch (error) {
    console.warn("[staff-chat] could not read the session:", error);
  }
  if (!token) return { ok: false, error: "You are signed out. Sign in and try again." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${getWebAppUrl()}/api/messenger/chat`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = ((await response.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (response.ok) return { ok: true, value: body };
    return {
      ok: false,
      status: response.status,
      error: typeof body.error === "string" ? body.error : `Request failed (${response.status})`,
      ...(typeof body.reason === "string" ? { reason: body.reason } : {}),
    };
  } catch (error) {
    console.warn("[staff-chat] request failed:", error);
    return { ok: false, error: OFFLINE };
  } finally {
    clearTimeout(timer);
  }
}

interface ChatRef {
  tenantId: string;
  sessionId: string;
}

export async function fetchStaffChatTools(ref: ChatRef): Promise<StaffChatResult<StaffChatTools>> {
  const result = await post({ action: "tools", ...ref });
  if (!result.ok) return result;
  const tools = parseStaffChatTools(result.value);
  return tools ? { ok: true, value: tools } : { ok: false, error: OFFLINE };
}

export async function previewStaffCard(ref: ChatRef, card: StaffCard, orderId?: string): Promise<StaffChatResult<PreviewMessage[]>> {
  const result = await post({ action: "preview", ...ref, card, ...(orderId ? { orderId } : {}) });
  if (!result.ok) return result;
  return Array.isArray(result.value.messages)
    ? { ok: true, value: result.value.messages as PreviewMessage[] }
    : { ok: false, error: OFFLINE };
}

/** `alreadySent`: this tap went out before (a retry after a timeout); nothing was sent twice. */
export interface SentReply {
  alreadySent: boolean;
  pausedUntil: number | null;
}

function sent(value: Record<string, unknown>): SentReply {
  const until = typeof value.pausedUntil === "string" ? Date.parse(value.pausedUntil) : NaN;
  return { alreadySent: value.status === "already_sent", pausedUntil: Number.isFinite(until) ? until : null };
}

export async function sendStaffCard(ref: ChatRef, clientId: string, card: StaffCard, orderId?: string): Promise<StaffChatResult<SentReply>> {
  const result = await post({ action: "send_card", ...ref, clientId, card, ...(orderId ? { orderId } : {}) });
  return result.ok ? { ok: true, value: sent(result.value) } : result;
}

export async function sendStaffText(ref: ChatRef, clientId: string, text: string): Promise<StaffChatResult<SentReply>> {
  const result = await post({ action: "send_text", ...ref, clientId, text });
  return result.ok ? { ok: true, value: sent(result.value) } : result;
}

export async function setChatBotPaused(ref: ChatRef, pause: boolean): Promise<StaffChatResult<SentReply>> {
  const result = await post({ action: "bot", ...ref, pause });
  return result.ok ? { ok: true, value: sent(result.value) } : result;
}
