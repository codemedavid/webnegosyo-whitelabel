import {
  botState,
  chatCustomerName,
  chunkPsids,
  describeOrderChat,
  isSameOrderChatBadge,
  facebookName,
  formatChatAge,
  hasMessageSinceOrder,
  isFacebookNameWorthShowing,
  isInsideReplyWindow,
  messengerPsidOf,
  newestLines,
  orderMessages,
  PSID_CHUNK,
  staffLineSender,
  toChatMessage,
  toChatRows,
  toChatSession,
  UNKNOWN_CHAT_CUSTOMER,
  type ChatMessage,
} from "./chat";

const NOW = new Date("2026-11-14T12:00:00+08:00").getTime();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function message(id: string, minutesAgo: number, direction: ChatMessage["direction"] = "in", body = "hello"): ChatMessage {
  return { id, direction, kind: "text", body, sentAt: NOW - minutesAgo * MINUTE };
}

describe("toChatSession", () => {
  it("reads a session row", () => {
    expect(
      toChatSession({
        id: "s1",
        psid: "123",
        first_name: " Ana ",
        last_name: "Cruz",
        profile_pic_url: "https://example.com/a.jpg",
        last_message_at: "2026-11-14T03:00:00Z",
        last_message_preview: "Pa-order po",
        last_inbound_at: "2026-11-14T03:00:00Z",
        bot_paused_until: null,
      }),
    ).toEqual({
      id: "s1",
      psid: "123",
      firstName: "Ana",
      lastName: "Cruz",
      photoUrl: "https://example.com/a.jpg",
      lastMessageAt: Date.parse("2026-11-14T03:00:00Z"),
      lastMessagePreview: "Pa-order po",
      lastInboundAt: Date.parse("2026-11-14T03:00:00Z"),
      botPausedUntil: null,
    });
  });

  it("reads the chats-list shape, whose id is session_id", () => {
    expect(toChatSession({ session_id: "s2", first_name: null })?.id).toBe("s2");
  });

  it("drops a photo that is not https and a row without an id", () => {
    expect(toChatSession({ id: "s1", profile_pic_url: "http://example.com/a.jpg" })?.photoUrl).toBeNull();
    expect(toChatSession({ first_name: "Ana" })).toBeNull();
    expect(toChatSession(null)).toBeNull();
  });
});

describe("toChatMessage", () => {
  it("reads a line and refuses an unusable one", () => {
    expect(toChatMessage({ id: "m1", direction: "staff", kind: "text", body: "On the way", sent_at: "2026-11-14T03:00:00Z" })).toEqual({
      id: "m1",
      direction: "staff",
      kind: "text",
      body: "On the way",
      sentAt: Date.parse("2026-11-14T03:00:00Z"),
    });
    expect(toChatMessage({ id: "m1", direction: "page", body: "x", sent_at: "2026-11-14T03:00:00Z" })).toBeNull();
    expect(toChatMessage({ id: "m1", direction: "in", body: " ", sent_at: "2026-11-14T03:00:00Z" })).toBeNull();
    expect(toChatMessage({ id: "m1", direction: "in", body: "x", sent_at: "soon" })).toBeNull();
  });
});

describe("names", () => {
  it("shows the Facebook name as Messenger lists do", () => {
    expect(facebookName({ firstName: "Ana", lastName: "cruz" })).toBe("Ana C.");
    expect(facebookName({ firstName: "Ana", lastName: null })).toBe("Ana");
    expect(facebookName({ firstName: null, lastName: "Cruz" })).toBeNull();
  });

  it("falls back to the checkout name, then to a plain label", () => {
    expect(chatCustomerName({ firstName: "Ana", lastName: "Cruz" }, "Table 4")).toBe("Ana C.");
    expect(chatCustomerName({ firstName: null, lastName: null }, " Juan ")).toBe("Juan");
    expect(chatCustomerName(null, "")).toBe(UNKNOWN_CHAT_CUSTOMER);
  });

  it("only adds the Facebook name when the checkout name does not already say it", () => {
    expect(isFacebookNameWorthShowing({ firstName: "Ana", lastName: "Cruz" }, "Ana Cruz")).toBe(false);
    expect(isFacebookNameWorthShowing({ firstName: "Ana", lastName: "Cruz" }, "Table 4")).toBe(true);
    expect(isFacebookNameWorthShowing({ firstName: "Ana", lastName: "Cruz" }, "Mariana")).toBe(true);
    expect(isFacebookNameWorthShowing({ firstName: null, lastName: null }, "Juan")).toBe(false);
  });
});

describe("messengerPsidOf", () => {
  it("reads the PSID a Messenger order carries", () => {
    expect(messengerPsidOf({ messenger_psid: " 987 " })).toBe("987");
    expect(messengerPsidOf({ messenger_psid: 987 })).toBeNull();
    expect(messengerPsidOf({})).toBeNull();
    expect(messengerPsidOf(null)).toBeNull();
  });
});

describe("hasMessageSinceOrder", () => {
  const order = { createdAt: NOW - 30 * MINUTE, status: "preparing" };

  it("is true when the customer wrote after ordering", () => {
    expect(hasMessageSinceOrder({ lastInboundAt: NOW - 5 * MINUTE }, order)).toBe(true);
  });

  it("is false for an older message, a finished order, or no chat", () => {
    expect(hasMessageSinceOrder({ lastInboundAt: NOW - 40 * MINUTE }, order)).toBe(false);
    expect(hasMessageSinceOrder({ lastInboundAt: NOW - 5 * MINUTE }, { ...order, status: "delivered" })).toBe(false);
    expect(hasMessageSinceOrder({ lastInboundAt: NOW - 5 * MINUTE }, { ...order, status: "cancelled" })).toBe(false);
    expect(hasMessageSinceOrder(null, order)).toBe(false);
  });
});

describe("botState", () => {
  it("says how long the bot stays quiet", () => {
    expect(botState({ botPausedUntil: NOW + 42 * MINUTE }, NOW)).toEqual({ isPaused: true, minutesLeft: 42, label: "Bot paused · 42 min" });
    expect(botState({ botPausedUntil: NOW + 20_000 }, NOW).label).toBe("Bot paused · 1 min");
    expect(botState({ botPausedUntil: NOW + 5 * HOUR }, NOW).label).toBe("Bot paused · 5 h");
  });

  it("is on when the pause is over or was never set", () => {
    expect(botState({ botPausedUntil: NOW - MINUTE }, NOW)).toEqual({ isPaused: false, minutesLeft: 0, label: "Bot on" });
    expect(botState({ botPausedUntil: null }, NOW).isPaused).toBe(false);
    expect(botState(null, NOW).isPaused).toBe(false);
  });
});

describe("isInsideReplyWindow", () => {
  it("follows Meta's 24 hours from the customer's last message", () => {
    expect(isInsideReplyWindow({ lastInboundAt: NOW - 23 * HOUR }, NOW)).toBe(true);
    expect(isInsideReplyWindow({ lastInboundAt: NOW - 24 * HOUR }, NOW)).toBe(false);
    expect(isInsideReplyWindow({ lastInboundAt: null }, NOW)).toBe(false);
  });
});

describe("thread rows", () => {
  it("orders oldest first and keeps each line once", () => {
    const lines = orderMessages([message("b", 1), message("a", 9), message("b", 1)]);
    expect(lines.map((line) => line.id)).toEqual(["a", "b"]);
  });

  it("puts a separator before the first line of each day", () => {
    const rows = toChatRows([message("today", 10), message("yesterday", 26 * 60), message("old", 5 * 24 * 60)], NOW);
    expect(rows.map((row) => (row.type === "day" ? row.label : row.message.id))).toEqual([
      "Nov 9",
      "old",
      "Yesterday",
      "yesterday",
      "Today",
      "today",
    ]);
  });

  it("peeks at the newest lines, oldest first", () => {
    const lines = newestLines([message("1", 40), message("2", 30), message("3", 20), message("4", 10)]);
    expect(lines.map((line) => line.id)).toEqual(["2", "3", "4"]);
  });
});

describe("formatChatAge", () => {
  it("is short for a list row", () => {
    expect(formatChatAge(NOW - 20_000, NOW)).toBe("now");
    expect(formatChatAge(NOW - 12 * MINUTE, NOW)).toBe("12m");
    expect(formatChatAge(NOW - 3 * HOUR, NOW)).toBe("3h");
    expect(formatChatAge(NOW - 3 * 24 * HOUR, NOW)).toBe("Nov 11");
    expect(formatChatAge(null, NOW)).toBe("");
  });
});

describe("chunkPsids", () => {
  it("asks about each customer once, in batches", () => {
    const psids = Array.from({ length: PSID_CHUNK + 5 }, (_, i) => `p${i}`);
    const chunks = chunkPsids([...psids, "p0"]);
    expect(chunks.map((chunk) => chunk.length)).toEqual([PSID_CHUNK, 5]);
  });
});

describe("describeOrderChat", () => {
  const session = toChatSession({
    id: "s1",
    psid: "123",
    first_name: "Ana",
    last_name: "Cruz",
    profile_pic_url: "https://example.com/a.jpg",
    last_inbound_at: new Date(NOW - 5 * MINUTE).toISOString(),
  });
  const order = { customerName: "Table 4", customerData: { messenger_psid: "123" }, createdAt: NOW - 30 * MINUTE, status: "preparing" };

  it("is null for an order that did not come from a chat", () => {
    expect(describeOrderChat({ ...order, customerData: { table_number: "4" } }, session)).toBeNull();
  });

  it("names the Facebook customer when the checkout name does not", () => {
    expect(describeOrderChat(order, session)).toEqual({
      sessionId: "s1",
      photoUrl: "https://example.com/a.jpg",
      label: "Messenger · Ana C.",
      facebookName: "Ana C.",
      hasNewMessage: true,
    });
  });

  it("recognises an order staff rang up for a chat before the customer's Messenger id is attached", () => {
    const rungUp = { ...order, customerData: { messenger_session_id: "0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f" } };
    expect(describeOrderChat(rungUp, null)).toMatchObject({
      sessionId: "0f9c1c2e-6f9a-4d7f-9c1b-2a3b4c5d6e7f",
      label: "Messenger",
    });
    // A made-up id is not a chat.
    expect(describeOrderChat({ ...order, customerData: { messenger_session_id: "abc" } }, null)).toBeNull();
  });

  it("redraws a card when what the server recorded about its summary changes", () => {
    const badge = describeOrderChat(order, session);
    if (!badge) throw new Error("expected a badge");
    const waiting = { orderId: "o1", state: "waiting" as const, outcome: "sent", summarySentAt: NOW, createdAt: NOW };
    expect(isSameOrderChatBadge(badge, { ...badge })).toBe(true);
    // Not looked up yet vs looked up and nothing recorded: the chip appears.
    expect(isSameOrderChatBadge(badge, { ...badge, chatOrder: null })).toBe(false);
    expect(isSameOrderChatBadge({ ...badge, chatOrder: null }, { ...badge, chatOrder: waiting })).toBe(false);
    expect(isSameOrderChatBadge({ ...badge, chatOrder: waiting }, { ...badge, chatOrder: { ...waiting } })).toBe(true);
    expect(
      isSameOrderChatBadge({ ...badge, chatOrder: waiting }, { ...badge, chatOrder: { ...waiting, state: "change_requested" } }),
    ).toBe(false);
  });

  it("stays a plain chip when the names agree or the chat is not readable", () => {
    expect(describeOrderChat({ ...order, customerName: "Ana Cruz" }, session)?.label).toBe("Messenger");
    expect(describeOrderChat(order, null)).toEqual({
      sessionId: null,
      photoUrl: null,
      label: "Messenger",
      facebookName: null,
      hasNewMessage: false,
    });
  });
});

describe("needs a reply", () => {
  const { needsReplyLabel, sortChatsForMonitoring, toChatSession } = jest.requireActual("./chat") as typeof import("./chat");
  const NOW_MS = Date.parse("2026-11-15T06:00:00Z");

  it("reads needs_reply_since only when the list sends it", () => {
    expect(toChatSession({ id: "s1", psid: "p", needs_reply_since: "2026-11-15T05:48:00Z" })?.needsReplySince).toBe(Date.parse("2026-11-15T05:48:00Z"));
    expect(toChatSession({ id: "s1", psid: "p" })).not.toHaveProperty("needsReplySince");
  });

  it("says how long they have waited", () => {
    expect(needsReplyLabel({ needsReplySince: NOW_MS - 12 * 60_000 }, NOW_MS)).toBe("Needs a reply · 12 min");
    expect(needsReplyLabel({ needsReplySince: NOW_MS - 3 * 3600_000 }, NOW_MS)).toBe("Needs a reply · 3 h");
    expect(needsReplyLabel({ needsReplySince: NOW_MS - 10_000 }, NOW_MS)).toBe("Needs a reply · just now");
    expect(needsReplyLabel({ needsReplySince: null }, NOW_MS)).toBeNull();
    expect(needsReplyLabel({}, NOW_MS)).toBeNull();
  });

  it("puts waiting chats first, longest wait on top, and keeps the rest in order", () => {
    const entry = (id: string, lastMessageAt: number, needsReplySince?: number) => ({ id, session: { lastMessageAt, needsReplySince } });
    const sorted = sortChatsForMonitoring([entry("new", 5), entry("w-recent", 4, 300), entry("old", 3), entry("w-long", 2, 100)]);
    expect(sorted.map((row) => row.id)).toEqual(["w-long", "w-recent", "new", "old"]);
  });
});

describe("who sent a staff line", () => {
  const VIEWER = "11111111-1111-4111-8111-111111111111";
  it("reads sent_by only on staff lines", () => {
    expect(toChatMessage({ id: "m1", direction: "staff", kind: "text", body: "Ready na po!", sent_at: "2026-11-15T06:00:00Z", sent_by: VIEWER })).toMatchObject({ sentBy: VIEWER });
    expect(toChatMessage({ id: "m2", direction: "in", kind: "text", body: "hi", sent_at: "2026-11-15T06:00:00Z", sent_by: VIEWER })).not.toHaveProperty("sentBy");
  });

  it("says You · app, Staff · app, or nothing for Page Inbox", () => {
    expect(staffLineSender({ direction: "staff", sentBy: VIEWER }, VIEWER)).toBe("You · app");
    expect(staffLineSender({ direction: "staff", sentBy: "someone-else" }, VIEWER)).toBe("Staff · app");
    expect(staffLineSender({ direction: "staff" }, VIEWER)).toBeNull();
    expect(staffLineSender({ direction: "in", sentBy: VIEWER }, VIEWER)).toBeNull();
  });
});

describe("mergeChatPages", () => {
  const { mergeChatPages } = jest.requireActual("./chat") as typeof import("./chat");
  const entry = (id: string, preview: string) => ({ session: { id }, preview });

  it("keeps each chat once, the first page's newer copy winning", () => {
    const merged = mergeChatPages([entry("a", "new"), entry("b", "b")], [entry("a", "old"), entry("c", "c"), entry("c", "dup")]);
    expect(merged.map((row) => `${row.session.id}:${row.preview}`)).toEqual(["a:new", "b:b", "c:c"]);
  });

  it("hands back the first page itself when nothing more was loaded", () => {
    const first = [entry("a", "x")];
    expect(mergeChatPages(first, [])).toBe(first);
  });
});
