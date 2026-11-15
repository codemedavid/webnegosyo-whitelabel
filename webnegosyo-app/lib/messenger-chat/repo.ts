/**
 * Messenger chats ↔ platform.
 *
 * Every read runs as the signed-in staff account, so the database decides who
 * sees a chat (`app_user_may_read_messenger_chat`: an order key store-wide; a
 * branch account only the chats behind its own branch's orders). A refusal is
 * therefore silent — zero rows — and reads here as "no chat", which is also
 * what a store that never connected Messenger gets.
 *
 * A failure is returned, never swallowed into "no chat": the order screen says
 * so and offers a retry.
 *
 * The client is injected so the hooks never import the live one in tests.
 */

import { toChatOrderRecord, type ChatOrderRecord } from "./chat-order";
import {
  chunkPsids,
  orderMessages,
  toChatMessage,
  toChatSession,
  type ChatMessage,
  type ChatSession,
} from "./chat";

export interface DbResult {
  data: unknown;
  error: { message: string } | null;
}

/** The reads, as the signed-in account. Bound to Supabase in `./client.ts`. */
export interface ChatDb {
  sessionsByPsid(tenantId: string, psids: string[]): PromiseLike<DbResult>;
  sessionById(sessionId: string): PromiseLike<DbResult>;
  /** Newest first, `limit` lines, older than `beforeIso` when given. */
  messages(sessionId: string, limit: number, beforeIso: string | null): PromiseLike<DbResult>;
  chats(tenantId: string, limit: number, beforeIso: string | null): PromiseLike<DbResult>;
  /** What happened to the summary of each order rung up for a chat. */
  chatOrders(orderIds: string[]): PromiseLike<DbResult>;
}

export type ChatRead<T> = { ok: true; value: T } | { ok: false; reason: "unavailable" };

const UNAVAILABLE = { ok: false, reason: "unavailable" } as const;

function rows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [];
}

/** The chat behind each Messenger customer on screen, keyed by PSID. */
export async function fetchSessionsByPsid(
  db: ChatDb,
  tenantId: string,
  psids: readonly string[],
): Promise<ChatRead<Map<string, ChatSession>>> {
  const chunks = chunkPsids(psids);
  if (chunks.length === 0) return { ok: true, value: new Map() };

  const results = await Promise.all(chunks.map((chunk) => db.sessionsByPsid(tenantId, chunk)));
  if (results.some((result) => result.error)) return UNAVAILABLE;

  const byPsid = new Map<string, ChatSession>();
  for (const result of results) {
    for (const row of rows(result.data)) {
      const session = toChatSession(row);
      if (session?.psid) byPsid.set(session.psid, session);
    }
  }
  return { ok: true, value: byPsid };
}

export const THREAD_PAGE = 30;

export interface ChatThread {
  session: ChatSession;
  /** Oldest first. */
  messages: ChatMessage[];
  /** There may be older lines than the ones loaded. */
  hasOlder: boolean;
}

/** One conversation: who it is and the newest lines. Null = no such chat for this account. */
export async function fetchChatThread(db: ChatDb, sessionId: string): Promise<ChatRead<ChatThread | null>> {
  const [sessionResult, messageResult] = await Promise.all([
    db.sessionById(sessionId),
    db.messages(sessionId, THREAD_PAGE, null),
  ]);
  if (sessionResult.error || messageResult.error) return UNAVAILABLE;

  const session = toChatSession(sessionResult.data);
  if (!session) return { ok: true, value: null };

  const loaded = rows(messageResult.data);
  const messages = orderMessages(loaded.map(toChatMessage).filter((line): line is ChatMessage => line !== null));
  return { ok: true, value: { session, messages, hasOlder: loaded.length >= THREAD_PAGE } };
}

/** The page of lines before the oldest one on screen. */
export async function fetchOlderMessages(
  db: ChatDb,
  sessionId: string,
  oldestSentAt: number,
): Promise<ChatRead<{ messages: ChatMessage[]; hasOlder: boolean }>> {
  const result = await db.messages(sessionId, THREAD_PAGE, new Date(oldestSentAt).toISOString());
  if (result.error) return UNAVAILABLE;
  const loaded = rows(result.data);
  const messages = orderMessages(loaded.map(toChatMessage).filter((line): line is ChatMessage => line !== null));
  return { ok: true, value: { messages, hasOlder: loaded.length >= THREAD_PAGE } };
}

export interface ChatListEntry {
  session: ChatSession;
  /** The customer's newest order this account may read, if any. */
  order: { id: string; dailyNumber: number | null; status: string; createdAt: number } | null;
}

export const CHATS_PAGE = 30;

function toListEntry(row: unknown): ChatListEntry | null {
  const session = toChatSession(row);
  if (!session) return null;
  const r = row as Record<string, unknown>;
  const createdAt = typeof r.order_created_at === "string" ? Date.parse(r.order_created_at) : NaN;
  const order =
    typeof r.order_id === "string" && typeof r.order_status === "string" && Number.isFinite(createdAt)
      ? {
          id: r.order_id,
          dailyNumber: typeof r.order_daily_number === "number" ? r.order_daily_number : null,
          status: r.order_status,
          createdAt,
        }
      : null;
  return { session, order };
}

/** A store's conversations, newest first. `before` = the last row's `lastMessageAt`. */
export async function fetchChats(
  db: ChatDb,
  tenantId: string,
  before: number | null = null,
): Promise<ChatRead<{ chats: ChatListEntry[]; hasMore: boolean }>> {
  const result = await db.chats(tenantId, CHATS_PAGE, before === null ? null : new Date(before).toISOString());
  if (result.error) return UNAVAILABLE;
  const loaded = rows(result.data);
  const chats = loaded.map(toListEntry).filter((entry): entry is ChatListEntry => entry !== null);
  return { ok: true, value: { chats, hasMore: loaded.length >= CHATS_PAGE } };
}

const CHAT_ORDER_CHUNK = 100;

/**
 * Where each order rung up for a chat stands (summary sent, confirmed, wants a
 * change), keyed by order id. An order without a row is simply absent: the
 * summary has not been claimed yet, or this account may not read the order.
 */
export async function fetchChatOrders(
  db: ChatDb,
  orderIds: readonly string[],
): Promise<ChatRead<Map<string, ChatOrderRecord>>> {
  const unique = [...new Set(orderIds)];
  if (unique.length === 0) return { ok: true, value: new Map() };

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHAT_ORDER_CHUNK) chunks.push(unique.slice(i, i + CHAT_ORDER_CHUNK));
  const results = await Promise.all(chunks.map((chunk) => db.chatOrders(chunk)));
  if (results.some((result) => result.error)) return UNAVAILABLE;

  const byOrderId = new Map<string, ChatOrderRecord>();
  for (const result of results) {
    for (const row of rows(result.data)) {
      const record = toChatOrderRecord(row);
      if (record) byOrderId.set(record.orderId, record);
    }
  }
  return { ok: true, value: byOrderId };
}
