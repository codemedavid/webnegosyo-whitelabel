/**
 * The customer's Messenger chat, as the app shows it (plan 2026-11-11, B2).
 *
 * Pure: rows in, what a screen draws out. The rows come from the platform
 * (`messenger_sessions`, `messenger_messages`) through `./repo.ts`, read as
 * the signed-in staff account, so the database decides who sees a chat.
 *
 * A Facebook name is not always there: Meta only hands it over for some
 * customers, and never for someone who joined Messenger with a phone number.
 * Every label therefore takes the name typed at checkout as its fallback, and
 * a card is never blank.
 */

import { chatSessionIdOf, type ChatOrderRecord } from "./chat-order";

export type ChatDirection = "in" | "bot" | "staff";

export interface ChatSession {
  id: string;
  psid: string;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  /** Epoch ms; null when nothing was logged yet. */
  lastMessageAt: number | null;
  lastMessagePreview: string | null;
  /** When the CUSTOMER last wrote (Meta's 24-hour window counts from here). */
  lastInboundAt: number | null;
  botPausedUntil: number | null;
  /**
   * Epoch ms the bot handed this chat to a person and nobody answered yet
   * (asked for staff, typed an order, wrote while paused). Only the chats
   * list reads it (`messenger_chats`); absent elsewhere.
   */
  needsReplySince?: number | null;
}

export interface ChatMessage {
  id: string;
  direction: ChatDirection;
  kind: string;
  body: string;
  sentAt: number;
  /** The staff account that sent it from the app; absent for Page Inbox, bot and customer lines. */
  sentBy?: string;
}

const DIRECTIONS: readonly ChatDirection[] = ["in", "bot", "staff"];

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function time(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function httpsUrl(value: unknown): string | null {
  const url = text(value, 2048);
  return url && url.startsWith("https://") ? url : null;
}

/** A `messenger_sessions` row (or the RPC's `session` object). Null when unusable. */
export function toChatSession(row: unknown, psidOverride?: string): ChatSession | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = text(r.id ?? r.session_id, 64);
  const psid = text(r.psid, 128) ?? psidOverride ?? "";
  if (!id) return null;
  return {
    id,
    psid,
    firstName: text(r.first_name, 80),
    lastName: text(r.last_name, 80),
    photoUrl: httpsUrl(r.profile_pic_url),
    lastMessageAt: time(r.last_message_at),
    lastMessagePreview: text(r.last_message_preview, 120),
    lastInboundAt: time(r.last_inbound_at),
    botPausedUntil: time(r.bot_paused_until),
    ...(time(r.needs_reply_since) !== null ? { needsReplySince: time(r.needs_reply_since) } : {}),
  };
}

/** "Needs a reply · 12 min" for a chat waiting on a person; null when nothing waits. */
export function needsReplyLabel(session: Pick<ChatSession, "needsReplySince">, nowMs: number): string | null {
  const since = session.needsReplySince ?? null;
  if (since === null) return null;
  const minutes = Math.max(0, Math.floor((nowMs - since) / 60_000));
  const wait = minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min` : minutes < 48 * 60 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 1440)} days`;
  return `Needs a reply · ${wait}`;
}

/**
 * The chats list for watching: chats waiting on a person first, the one that
 * has waited longest at the top; then every other chat, newest first.
 */
export function sortChatsForMonitoring<T extends { session: Pick<ChatSession, "needsReplySince" | "lastMessageAt"> }>(entries: readonly T[]): T[] {
  const waiting = entries.filter((entry) => entry.session.needsReplySince != null);
  const rest = entries.filter((entry) => entry.session.needsReplySince == null);
  waiting.sort((a, b) => (a.session.needsReplySince ?? 0) - (b.session.needsReplySince ?? 0));
  return [...waiting, ...rest];
}

/**
 * The first page and the pages loaded after it, each chat once. A chat that
 * got a new message between two page loads comes back on the first page AND
 * on the later one; the first page's copy (the newer one) wins.
 */
export function mergeChatPages<T extends { session: { id: string } }>(first: readonly T[], more: readonly T[]): readonly T[] {
  if (more.length === 0) return first;
  const seen = new Set(first.map((entry) => entry.session.id));
  const rest = more.filter((entry) => {
    if (seen.has(entry.session.id)) return false;
    seen.add(entry.session.id);
    return true;
  });
  return [...first, ...rest];
}

/** A `messenger_messages` row. Null when unusable. */
export function toChatMessage(row: unknown): ChatMessage | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = text(r.id, 64);
  const body = text(r.body, 1000);
  const sentAt = time(r.sent_at);
  const direction = DIRECTIONS.find((d) => d === r.direction);
  if (!id || !body || sentAt === null || !direction) return null;
  const sentBy = direction === "staff" ? text(r.sent_by, 64) : null;
  return { id, direction, kind: text(r.kind, 20) ?? "text", body, sentAt, ...(sentBy ? { sentBy } : {}) };
}

/**
 * Who sent a staff line, under the bubble: "You · app" / "Staff · app" for a
 * reply sent from the merchant app, nothing for Page Inbox (no account is
 * known there). Names of other staff are not read: not every account may
 * read the team list.
 */
export function staffLineSender(message: Pick<ChatMessage, "direction" | "sentBy">, viewerId: string | null | undefined): string | null {
  if (message.direction !== "staff" || !message.sentBy) return null;
  return message.sentBy === viewerId ? "You · app" : "Staff · app";
}

/** Oldest first, each line once (a refetch can overlap a page). */
export function orderMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const unique = messages.filter((message) => (seen.has(message.id) ? false : (seen.add(message.id), true)));
  return unique.sort((a, b) => a.sentAt - b.sentAt);
}

/** The PSID a Messenger order carries; null for every other order. */
export function messengerPsidOf(customerData: Record<string, unknown> | null | undefined): string | null {
  const psid = customerData?.messenger_psid;
  return typeof psid === "string" && psid.trim() ? psid.trim() : null;
}

/** "Ana C." — first name and the last name's initial, as Messenger shows it in lists. */
export function facebookName(session: Pick<ChatSession, "firstName" | "lastName"> | null | undefined): string | null {
  if (!session?.firstName) return null;
  const initial = session.lastName ? ` ${session.lastName.charAt(0).toUpperCase()}.` : "";
  return `${session.firstName}${initial}`;
}

export const UNKNOWN_CHAT_CUSTOMER = "Messenger customer";

/** The Facebook name, else the name typed at checkout, else a plain label. */
export function chatCustomerName(
  session: Pick<ChatSession, "firstName" | "lastName"> | null | undefined,
  checkoutName?: string | null,
): string {
  const typed = typeof checkoutName === "string" ? checkoutName.trim() : "";
  return facebookName(session) ?? (typed || UNKNOWN_CHAT_CUSTOMER);
}

/**
 * Whether the Facebook name adds anything beside the checkout name ("Ana C."
 * next to "Ana Cruz" does not; "Ana C." next to "Table 4" does).
 */
export function isFacebookNameWorthShowing(
  session: Pick<ChatSession, "firstName" | "lastName"> | null | undefined,
  checkoutName?: string | null,
): boolean {
  const first = session?.firstName?.toLowerCase();
  if (!first) return false;
  const typed = (checkoutName ?? "").toLowerCase();
  return !typed.split(/\s+/).includes(first);
}

const FINISHED_STATUSES: readonly string[] = ["delivered", "cancelled", "completed"];

/**
 * The customer wrote after this order was placed and the order is still open:
 * staff should read the chat before the food goes out.
 */
export function hasMessageSinceOrder(
  session: Pick<ChatSession, "lastInboundAt"> | null | undefined,
  order: { createdAt: number; status: string },
): boolean {
  if (!session?.lastInboundAt) return false;
  if (FINISHED_STATUSES.includes(order.status)) return false;
  return session.lastInboundAt > order.createdAt;
}

export interface BotState {
  isPaused: boolean;
  /** Whole minutes left of a pause; 0 when the bot is on. */
  minutesLeft: number;
  label: string;
}

/** "Bot paused · 42 min" while staff have the chat; "Bot on" otherwise. */
export function botState(session: Pick<ChatSession, "botPausedUntil"> | null | undefined, nowMs: number): BotState {
  const until = session?.botPausedUntil ?? null;
  if (until === null || until <= nowMs) return { isPaused: false, minutesLeft: 0, label: "Bot on" };
  const minutesLeft = Math.max(1, Math.ceil((until - nowMs) / 60_000));
  const span = minutesLeft >= 120 ? `${Math.round(minutesLeft / 60)} h` : `${minutesLeft} min`;
  return { isPaused: true, minutesLeft, label: `Bot paused · ${span}` };
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Meta lets a Page write to a customer only within 24 hours of their last message. */
export function isInsideReplyWindow(session: Pick<ChatSession, "lastInboundAt"> | null | undefined, nowMs: number): boolean {
  return !!session?.lastInboundAt && nowMs - session.lastInboundAt < WINDOW_MS;
}

export type ChatRow =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; message: ChatMessage };

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dayLabel(ms: number, nowMs: number): string {
  if (dayKey(ms) === dayKey(nowMs)) return "Today";
  if (dayKey(ms) === dayKey(nowMs - WINDOW_MS)) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

/** The thread as list rows: a separator before the first line of each day. */
export function toChatRows(messages: readonly ChatMessage[], nowMs: number): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay = "";
  for (const message of orderMessages(messages)) {
    const key = dayKey(message.sentAt);
    if (key !== lastDay) {
      rows.push({ type: "day", key: `day-${key}`, label: dayLabel(message.sentAt, nowMs) });
      lastDay = key;
    }
    rows.push({ type: "message", key: message.id, message });
  }
  return rows;
}

/** The newest lines for the order screen's peek, oldest first. */
export function newestLines(messages: readonly ChatMessage[], count = 3): ChatMessage[] {
  return orderMessages(messages).slice(-count);
}

export function formatChatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/** "2m", "3h", "Nov 12" for the chats list. */
export function formatChatAge(ms: number | null, nowMs: number): string {
  if (ms === null) return "";
  const minutes = Math.floor((nowMs - ms) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return new Date(ms).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

/** Asked in batches so a 200-order queue is two requests, not one URL too long. */
export const PSID_CHUNK = 100;

export function chunkPsids(psids: readonly string[]): string[][] {
  const unique = [...new Set(psids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += PSID_CHUNK) chunks.push(unique.slice(i, i + PSID_CHUNK));
  return chunks;
}

export const ORDER_CHATS_RESOURCE = "messenger-order-chats";
export const CHAT_THREAD_RESOURCE = "messenger-chat-thread";
export const CHATS_RESOURCE = "messenger-chats";
export const CHAT_ORDERS_RESOURCE = "messenger-chat-orders";

/** What an order card draws for a Messenger order. */
export interface OrderChatBadge {
  sessionId: string | null;
  /** Meta's photo link; it expires, so the card falls back to initials when it fails. */
  photoUrl: string | null;
  /** "Messenger", or "Messenger · Ana C." when the Facebook name adds something. */
  label: string;
  /** The Facebook name, for an order placed without a name. */
  facebookName: string | null;
  /** The customer wrote after ordering and the order is still open. */
  hasNewMessage: boolean;
  /**
   * Staff rang this order up for the chat: what the server recorded about its
   * summary. The card turns it into a chip with its own clock (`describeChatOrder`).
   * Null = looked up, nothing recorded yet. Absent = not looked up, so no chip.
   */
  chatOrder?: ChatOrderRecord | null;
}

/**
 * The Messenger side of an order, or null for an order that did not come from
 * a chat. An order with a PSID but no readable chat still gets the chip.
 */
export function describeOrderChat(
  order: { customerName?: string | null; customerData?: Record<string, unknown> | null; createdAt: number; status: string },
  session: ChatSession | null | undefined,
): OrderChatBadge | null {
  // An order staff rang up for a chat names the chat itself; the customer's
  // Messenger id is attached by the server a moment later.
  const chatSessionId = chatSessionIdOf(order.customerData);
  if (!messengerPsidOf(order.customerData) && !chatSessionId) return null;
  const name = facebookName(session);
  const showsName = isFacebookNameWorthShowing(session, order.customerName);
  return {
    sessionId: session?.id ?? chatSessionId,
    photoUrl: session?.photoUrl ?? null,
    label: name && showsName ? `Messenger · ${name}` : "Messenger",
    facebookName: name,
    hasNewMessage: hasMessageSinceOrder(session, order),
  };
}

/** Same chip, so a memoised card may keep the object it already has. */
export function isSameOrderChatBadge(a: OrderChatBadge, b: OrderChatBadge): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.photoUrl === b.photoUrl &&
    a.label === b.label &&
    a.facebookName === b.facebookName &&
    a.hasNewMessage === b.hasNewMessage &&
    (a.chatOrder === undefined) === (b.chatOrder === undefined) &&
    (a.chatOrder?.state ?? null) === (b.chatOrder?.state ?? null) &&
    (a.chatOrder?.outcome ?? null) === (b.chatOrder?.outcome ?? null) &&
    (a.chatOrder?.summarySentAt ?? null) === (b.chatOrder?.summarySentAt ?? null)
  );
}
