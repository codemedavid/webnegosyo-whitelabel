/**
 * An order staff ring up for a Messenger chat: what the register writes, what
 * the order's chip says while it waits, and what can be picked out of the chat.
 */
import type { ChatMessage } from "./chat";
import {
  appendChatNote,
  CHAT_NOTE_MAX,
  chatOrderCustomerData,
  chatOrderSentNotice,
  chatSessionIdOf,
  describeChatOrder,
  fillChoicesFor,
  findInChat,
  findPhones,
  isFillableLine,
  isSameChatOrderStatus,
  NO_ANSWER_AFTER_MS,
  toChatOrderRecord,
  type ChatOrderRecord,
} from "./chat-order";

const SESSION = "0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f";
const NOW = Date.parse("2026-11-14T04:00:00Z");

const line = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1",
  direction: "in",
  kind: "text",
  body: "Hello po",
  sentAt: NOW,
  ...overrides,
});

describe("what the register writes on a chat order", () => {
  it("names the chat by its id, and never a Messenger id", () => {
    const data = chatOrderCustomerData({ sessionId: SESSION, name: "Ana C.", note: "" });
    expect(data).toEqual({ messenger_session_id: SESSION });
    expect(Object.keys(data)).not.toContain("messenger_psid");
  });

  it("keeps the note from the chat, trimmed and bounded", () => {
    const data = chatOrderCustomerData({ sessionId: SESSION, name: "Ana", note: `  ${"x".repeat(900)}  ` });
    expect(data.note_from_chat).toHaveLength(CHAT_NOTE_MAX);
  });

  it("writes nothing for an ordinary sale or a made-up id", () => {
    expect(chatOrderCustomerData(null)).toEqual({});
    expect(chatOrderCustomerData({ sessionId: "123456789", name: "Ana", note: "extra rice" })).toEqual({});
  });

  it("reads the chat back off an order", () => {
    expect(chatSessionIdOf({ messenger_session_id: SESSION })).toBe(SESSION);
    expect(chatSessionIdOf({ messenger_session_id: "nope" })).toBeNull();
    expect(chatSessionIdOf({ messenger_psid: "123" })).toBeNull();
    expect(chatSessionIdOf(null)).toBeNull();
  });
});

describe("appendChatNote", () => {
  it("adds lines, once each, and stays inside the limit", () => {
    const one = appendChatNote("", " No onions po ");
    expect(one).toBe("No onions po");
    const two = appendChatNote(one, "Extra sauce");
    expect(two).toBe("No onions po\nExtra sauce");
    expect(appendChatNote(two, "No onions po")).toBe(two);
    expect(appendChatNote(two, "   ")).toBe(two);
    expect(appendChatNote(two, "y".repeat(900)).length).toBe(CHAT_NOTE_MAX);
  });
});

describe("toChatOrderRecord", () => {
  it("reads a row and refuses anything else", () => {
    expect(
      toChatOrderRecord({
        order_id: "o1",
        state: "waiting",
        outcome: "sent",
        summary_sent_at: "2026-11-14T03:59:00Z",
        created_at: "2026-11-14T03:58:58Z",
      }),
    ).toEqual({
      orderId: "o1",
      state: "waiting",
      outcome: "sent",
      summarySentAt: Date.parse("2026-11-14T03:59:00Z"),
      createdAt: Date.parse("2026-11-14T03:58:58Z"),
    });
    expect(toChatOrderRecord({ order_id: "o1", state: "exploded" })).toBeNull();
    expect(toChatOrderRecord({ state: "waiting" })).toBeNull();
    expect(toChatOrderRecord(null)).toBeNull();
  });
});

describe("describeChatOrder", () => {
  const order = (overrides: Partial<{ status: string; createdAt: number; customerData: Record<string, unknown> | null; offlineSync: string }> = {}) => ({
    status: "pending",
    createdAt: NOW - 60_000,
    customerData: { messenger_session_id: SESSION },
    ...overrides,
  });
  const record = (overrides: Partial<ChatOrderRecord> = {}): ChatOrderRecord => ({
    orderId: "o1",
    state: "waiting",
    outcome: "sent",
    summarySentAt: NOW - 50_000,
    createdAt: NOW - 55_000,
    ...overrides,
  });

  it("says nothing about an order that was not rung up for a chat", () => {
    expect(describeChatOrder(order({ customerData: { messenger_psid: "123" } }), record(), NOW)).toBeNull();
    expect(describeChatOrder(order({ customerData: null }), null, NOW)).toBeNull();
  });

  it("waits for the customer, and tells staff they can confirm it themselves", () => {
    const status = describeChatOrder(order(), record(), NOW);
    expect(status).toMatchObject({ label: "Waiting for customer", tone: "waiting" });
    expect(status?.detail).toContain("confirm the order yourself");
  });

  it("turns into 'No answer yet' after half an hour, without cancelling anything", () => {
    const status = describeChatOrder(order(), record({ summarySentAt: NOW - NO_ANSWER_AFTER_MS }), NOW);
    expect(status).toMatchObject({ label: "No answer yet", tone: "attention" });
  });

  it("gives the summary two minutes to go out before calling it not sent", () => {
    expect(describeChatOrder(order({ createdAt: NOW - 30_000 }), null, NOW)).toMatchObject({ label: "Sending to customer", tone: "waiting" });
    expect(describeChatOrder(order({ createdAt: NOW - 30_000 }), record({ state: "claimed", outcome: "claimed" }), NOW)).toMatchObject({
      label: "Sending to customer",
    });
    expect(describeChatOrder(order({ createdAt: NOW - 5 * 60_000 }), null, NOW)).toMatchObject({ label: "Couldn't send", tone: "attention" });
  });

  it("never says Couldn't send for a sale still on this phone", () => {
    const queued = order({ createdAt: NOW - 30 * 60_000, offlineSync: "queued" });
    expect(describeChatOrder(queued, null, NOW)).toMatchObject({ label: "Saved on this phone", tone: "waiting" });
    // Once the server has its row, the row decides.
    expect(describeChatOrder(queued, record(), NOW)).toMatchObject({ label: "Waiting for customer" });
  });

  it("says why a summary did not go out", () => {
    const outside = describeChatOrder(order(), record({ state: "not_sent", outcome: "outside_window" }), NOW);
    expect(outside).toMatchObject({ label: "Couldn't send", tone: "attention" });
    expect(outside?.detail).toContain("24 hours");
    expect(describeChatOrder(order(), record({ state: "not_sent", outcome: "something_new" }), NOW)?.detail).toContain(
      "did not go out",
    );
  });

  it("flags a customer who asked for a change, even after staff confirmed", () => {
    expect(describeChatOrder(order(), record({ state: "change_requested" }), NOW)).toMatchObject({
      label: "Wants a change",
      tone: "attention",
    });
    expect(describeChatOrder(order({ status: "confirmed" }), record({ state: "change_requested" }), NOW)).toMatchObject({
      label: "Wants a change",
    });
  });

  it("credits the customer only for a confirm they tapped", () => {
    expect(describeChatOrder(order({ status: "confirmed" }), record({ state: "confirmed" }), NOW)).toMatchObject({
      label: "Customer confirmed",
      tone: "done",
    });
    // Staff pushed it through: nothing to say.
    expect(describeChatOrder(order({ status: "confirmed" }), record({ state: "waiting" }), NOW)).toBeNull();
    expect(describeChatOrder(order({ status: "preparing" }), record({ state: "confirmed" }), NOW)).toBeNull();
  });

  it("goes quiet once the order is finished or cancelled", () => {
    expect(describeChatOrder(order({ status: "cancelled" }), record({ state: "change_requested" }), NOW)).toBeNull();
    expect(describeChatOrder(order({ status: "delivered" }), record(), NOW)).toBeNull();
  });

  it("compares two chips by what they show", () => {
    const a = describeChatOrder(order(), record(), NOW);
    const b = describeChatOrder(order(), record({ summarySentAt: NOW - 40_000 }), NOW);
    expect(isSameChatOrderStatus(a, b)).toBe(true);
    expect(isSameChatOrderStatus(a, null)).toBe(false);
    expect(isSameChatOrderStatus(null, null)).toBe(true);
  });
});

describe("findPhones", () => {
  it("finds Philippine mobiles however they are typed", () => {
    expect(findPhones("09171234567")).toEqual(["09171234567"]);
    expect(findPhones("call me at +63 917 123 4567 po")).toEqual(["09171234567"]);
    expect(findPhones("0917-123-4567 or 639181234567")).toEqual(["09171234567", "09181234567"]);
    expect(findPhones("0917.123.4567, 0917 123 4567")).toEqual(["09171234567"]);
  });

  it("does not mistake a reference number, a landline or a short number for one", () => {
    expect(findPhones("GCash ref 1009171234567890")).toEqual([]);
    expect(findPhones("ref 091712345678")).toEqual([]);
    expect(findPhones("(02) 8123 4567")).toEqual([]);
    expect(findPhones("0917 123 456")).toEqual([]);
    expect(findPhones("2 pcs chicken, 1 rice")).toEqual([]);
  });
});

describe("findInChat", () => {
  it("looks only at what the customer typed, newest first, three at most", () => {
    const messages = [
      line({ id: "a", body: "09170000001", sentAt: NOW - 4000 }),
      line({ id: "b", direction: "staff", body: "Text us at 09179999999", sentAt: NOW - 3500 }),
      line({ id: "c", direction: "bot", body: "09178888888", sentAt: NOW - 3200 }),
      line({ id: "d", body: "09170000002 or 09170000003", sentAt: NOW - 3000 }),
      line({ id: "e", body: "new number 09170000004", sentAt: NOW - 1000 }),
      line({ id: "f", body: "09170000004 ulit", sentAt: NOW - 500 }),
    ];
    expect(findInChat(messages)).toEqual({ phones: ["09170000004", "09170000002", "09170000003"] });
    expect(findInChat([])).toEqual({ phones: [] });
  });
});

describe("tapping a line of the chat", () => {
  it("offers only the customer's own typed lines", () => {
    expect(isFillableLine(line())).toBe(true);
    expect(isFillableLine(line({ direction: "bot" }))).toBe(false);
    expect(isFillableLine(line({ direction: "staff" }))).toBe(false);
    expect(isFillableLine(line({ kind: "postback", body: "View menu" }))).toBe(false);
    expect(isFillableLine(line({ body: "   " }))).toBe(false);
    expect(fillChoicesFor(line({ direction: "bot" }))).toEqual([]);
  });

  it("offers a short line as a name, an address or a note", () => {
    expect(fillChoicesFor(line({ body: "  Ana   Cruz " }))).toEqual([
      { target: "name", label: "Use as name", value: "Ana Cruz" },
      { target: "address", label: "Use as delivery address", value: "Ana Cruz" },
      { target: "note", label: "Add to order note", value: "Ana Cruz" },
    ]);
  });

  it("offers the number, not the whole line, as the phone", () => {
    const choices = fillChoicesFor(line({ body: "eto po number ko 0917 123 4567" }));
    expect(choices.map((choice) => choice.target)).toEqual(["phone", "address", "note"]);
    expect(choices[0]).toEqual({ target: "phone", label: "Use 09171234567 as phone", value: "09171234567" });
  });

  it("does not offer a long line as a name", () => {
    const long = "Blk 4 Lot 12 Sampaguita St, Brgy San Isidro, likod ng covered court, green gate po";
    expect(fillChoicesFor(line({ body: long })).map((choice) => choice.target)).toEqual(["address", "note"]);
  });
});

describe("chatOrderSentNotice", () => {
  it("says who it went to and how it reaches the kitchen", () => {
    expect(chatOrderSentNotice("Ana C.", false)).toBe(
      "Sent to Ana C. to confirm. It reaches the kitchen once they tap Confirm, or you confirm it.",
    );
    expect(chatOrderSentNotice("Ana C.", true)).toContain("once this phone is back online");
  });
});
