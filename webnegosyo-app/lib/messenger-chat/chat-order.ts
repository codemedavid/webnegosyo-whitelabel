/**
 * An order staff ring up for a Messenger customer (plan 2026-11-14, C2).
 *
 * The register opens from a chat, the order is saved WAITING and the server
 * sends its summary to the customer to confirm. This file is the app's pure
 * half: what the register writes on such an order, what the order's chip says
 * while it waits, and what can be picked out of the customer's own messages
 * (a phone number is spotted; a name, address or note is whatever line the
 * cashier taps — nothing is guessed, and nothing leaves the phone).
 */

import type { ChatMessage } from "./chat";

/** The chat the register is ringing an order up for. */
export interface PosChatOrder {
  sessionId: string;
  /** Who the banner says the order is for. */
  name: string;
  /** A line (or lines) of the chat kept as the order's note. */
  note: string;
}

/** `customer_data` key the server resolves into the customer (the register never sends a Messenger id). */
export const CHAT_SESSION_KEY = "messenger_session_id";
/** Shows on the order and its receipt as "Note from chat". */
export const CHAT_NOTE_KEY = "note_from_chat";
export const CHAT_NOTE_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a chat order adds to the order's `customer_data`. */
export function chatOrderCustomerData(chat: PosChatOrder | null): Record<string, string> {
  if (!chat || !UUID.test(chat.sessionId)) return {};
  const note = chat.note.trim().slice(0, CHAT_NOTE_MAX);
  return { [CHAT_SESSION_KEY]: chat.sessionId, ...(note ? { [CHAT_NOTE_KEY]: note } : {}) };
}

/** The chat an order was rung up for, if any. */
export function chatSessionIdOf(customerData: Record<string, unknown> | null | undefined): string | null {
  const value = customerData?.[CHAT_SESSION_KEY];
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/** Add a line to the note; the same line twice is kept once. */
export function appendChatNote(note: string, line: string): string {
  const next = line.trim();
  if (!next) return note;
  const lines = note.split("\n").map((part) => part.trim()).filter(Boolean);
  if (lines.includes(next)) return note;
  return [...lines, next].join("\n").slice(0, CHAT_NOTE_MAX);
}

// ── What the server recorded ─────────────────────────────────────────────────

export type ChatOrderState = "claimed" | "waiting" | "sent" | "not_sent" | "confirmed" | "change_requested";

export interface ChatOrderRecord {
  orderId: string;
  state: ChatOrderState;
  outcome: string;
  summarySentAt: number | null;
  createdAt: number | null;
}

const STATES: readonly ChatOrderState[] = ["claimed", "waiting", "sent", "not_sent", "confirmed", "change_requested"];

function toMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** A `messenger_chat_orders` row. Null for anything that is not one. */
export function toChatOrderRecord(row: unknown): ChatOrderRecord | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.order_id !== "string" || !STATES.includes(r.state as ChatOrderState)) return null;
  return {
    orderId: r.order_id,
    state: r.state as ChatOrderState,
    outcome: typeof r.outcome === "string" ? r.outcome : "",
    summarySentAt: toMs(r.summary_sent_at),
    createdAt: toMs(r.created_at),
  };
}

export type ChatOrderTone = "waiting" | "attention" | "done";

export interface ChatOrderStatus {
  /** The chip. */
  label: string;
  tone: ChatOrderTone;
  /** One line for the order screen: what happened and what staff can do. */
  detail: string;
}

/** After this long a waiting order says "No answer yet". Nothing is cancelled. */
export const NO_ANSWER_AFTER_MS = 30 * 60 * 1000;
/** The summary normally goes out within seconds; past this the order says it did not. */
const SENDING_GRACE_MS = 2 * 60 * 1000;

const NOT_SENT_REASONS: Record<string, string> = {
  outside_window: "The customer last wrote over 24 hours ago, so Messenger no longer lets the Page write first.",
  no_session: "The chat could not be found for this store.",
  no_page: "The store's Facebook Page is not connected.",
  send_failed: "Messenger refused the message.",
  too_many: "This chat already got several order summaries in the last hour.",
  no_items: "The order's dishes had not arrived when the summary was built.",
  not_platform: "Order summaries need SmartMenu's order system.",
  no_store: "The store's Messenger settings could not be read.",
};

const CONFIRM_YOURSELF = "If they already said yes, confirm the order yourself.";

/**
 * Where a chat order stands, for its card and screen. Null for an order that
 * was not rung up for a chat, or one with nothing left to say.
 */
export function describeChatOrder(
  order: {
    status: string;
    createdAt: number;
    customerData?: Record<string, unknown> | null;
    /** Set while the sale (or a change to it) waits on this phone for a connection. */
    offlineSync?: string | null;
  },
  record: ChatOrderRecord | null | undefined,
  nowMs: number,
): ChatOrderStatus | null {
  if (!chatSessionIdOf(order.customerData)) return null;
  const isOpen = order.status !== "cancelled" && order.status !== "delivered";
  if (!isOpen) return null;

  // Still on this phone: the server has not seen the order, so nothing could
  // have been sent yet. Not "Couldn't send": it goes once the phone is online.
  if (!record && order.offlineSync) {
    return {
      label: "Saved on this phone",
      tone: "waiting",
      detail: "The order summary goes to the customer once this phone is back online.",
    };
  }

  if (record?.state === "change_requested") {
    return {
      label: "Wants a change",
      tone: "attention",
      detail: "The customer tapped Change something. Read the chat, edit the order, then confirm it.",
    };
  }
  if (order.status !== "pending") {
    return record?.state === "confirmed" && order.status === "confirmed"
      ? { label: "Customer confirmed", tone: "done", detail: "The customer confirmed this order in Messenger." }
      : null;
  }

  if (!record || record.state === "claimed") {
    return nowMs - order.createdAt < SENDING_GRACE_MS
      ? { label: "Sending to customer", tone: "waiting", detail: "The order summary is on its way to the customer's Messenger." }
      : {
          label: "Couldn't send",
          tone: "attention",
          detail: `The order summary did not go out. Message the customer from the Page inbox. ${CONFIRM_YOURSELF}`,
        };
  }
  if (record.state === "not_sent") {
    const reason = NOT_SENT_REASONS[record.outcome] ?? "The order summary did not go out.";
    return { label: "Couldn't send", tone: "attention", detail: `${reason} Message the customer from the Page inbox. ${CONFIRM_YOURSELF}` };
  }
  const sentAt = record.summarySentAt ?? record.createdAt ?? order.createdAt;
  return nowMs - sentAt >= NO_ANSWER_AFTER_MS
    ? { label: "No answer yet", tone: "attention", detail: `The customer has not confirmed yet. ${CONFIRM_YOURSELF}` }
    : { label: "Waiting for customer", tone: "waiting", detail: `The customer got the order summary and has not confirmed yet. ${CONFIRM_YOURSELF}` };
}

export function isSameChatOrderStatus(a: ChatOrderStatus | null, b: ChatOrderStatus | null): boolean {
  return a === b || (a !== null && b !== null && a.label === b.label && a.tone === b.tone);
}

// ── Picking details out of the chat ──────────────────────────────────────────

/**
 * Philippine mobile numbers in a line, as 09XXXXXXXXX. Accepts +63 / 63 / 0
 * prefixes with spaces, dots or dashes between the groups. A longer run of
 * digits (a reference number) is not a phone.
 */
export function findPhones(text: string): string[] {
  const found: string[] = [];
  const pattern = /(?:\+?63|0)[\s.-]?9(?:[\s.-]?\d){9}/g;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const before = text[start - 1];
    const after = text[start + match[0].length];
    if ((before && /[\d+]/.test(before)) || (after && /\d/.test(after))) continue;
    const digits = match[0].replace(/\D/g, "");
    const local = digits.startsWith("63") ? `0${digits.slice(2)}` : digits;
    if (local.length === 11 && !found.includes(local)) found.push(local);
  }
  return found;
}

export interface FoundInChat {
  /** Newest first. */
  phones: string[];
}

/** What the app spotted in the CUSTOMER's own lines (never the bot's or staff's). */
export function findInChat(messages: readonly ChatMessage[]): FoundInChat {
  const phones: string[] = [];
  for (const message of [...messages].sort((a, b) => b.sentAt - a.sentAt)) {
    if (message.direction !== "in") continue;
    for (const phone of findPhones(message.body)) if (!phones.includes(phone)) phones.push(phone);
  }
  return { phones: phones.slice(0, 3) };
}

export type ChatFillTarget = "name" | "phone" | "address" | "note";

export interface ChatFillChoice {
  target: ChatFillTarget;
  label: string;
  /** What would be written. */
  value: string;
}

const NAME_MAX = 60;
const ADDRESS_MAX = 300;

/** A customer line someone might tap: only what a person typed. */
export function isFillableLine(message: ChatMessage): boolean {
  return message.direction === "in" && message.kind === "text" && message.body.trim().length > 0;
}

/**
 * What one tapped line can fill. A phone is offered only when the line holds
 * one; a name only when the line is short enough to be one.
 */
export function fillChoicesFor(message: ChatMessage): ChatFillChoice[] {
  if (!isFillableLine(message)) return [];
  const text = message.body.replace(/\s+/g, " ").trim();
  const [phone] = findPhones(text);
  return [
    ...(text.length <= NAME_MAX && !phone ? [{ target: "name" as const, label: "Use as name", value: text }] : []),
    ...(phone ? [{ target: "phone" as const, label: `Use ${phone} as phone`, value: phone }] : []),
    { target: "address", label: "Use as delivery address", value: text.slice(0, ADDRESS_MAX) },
    { target: "note", label: "Add to order note", value: text.slice(0, CHAT_NOTE_MAX) },
  ];
}

/** "Sent to Ana C. to confirm": the line the register shows after a chat order. */
export function chatOrderSentNotice(name: string, isSavedOffline: boolean): string {
  return isSavedOffline
    ? `Saved. ${name} gets the order to confirm once this phone is back online.`
    : `Sent to ${name} to confirm. It reaches the kitchen once they tap Confirm, or you confirm it.`;
}
