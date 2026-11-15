import {
  botSwitch,
  describePreview,
  lockReason,
  newClientId,
  parseStaffChatTools,
  stillPending,
  windowNote,
  type PendingReply,
  type StaffChatTools,
} from "./staff-chat";
import type { ChatMessage } from "./chat";

const NOW = Date.parse("2026-11-15T06:00:00Z");
const MIN = 60_000;

const serverTools = {
  blocked: null,
  window: { isOpen: true, endsAt: "2026-11-16T05:00:00.000Z" },
  bot: { enabled: true, pausedUntil: null, takeoverMinutes: 60 },
  cart: { count: 2, totalCentavos: 25500 },
  order: { id: "o1", label: "#03", status: "preparing", isPaid: false, isChatOrder: false },
  chips: [
    { card: "cart", label: "Send checkout · ₱255" },
    { card: "pay", label: "How to pay", orderId: "o1" },
    { card: "dance", label: "Not a card" },
  ],
};

function tools(extra: Partial<StaffChatTools> = {}): StaffChatTools {
  return { ...(parseStaffChatTools(serverTools) as StaffChatTools), ...extra };
}

describe("parseStaffChatTools", () => {
  it("reads the server's answer and drops cards it doesn't know", () => {
    const parsed = parseStaffChatTools(serverTools);
    expect(parsed).toMatchObject({
      blocked: null,
      window: { isOpen: true, endsAt: Date.parse("2026-11-16T05:00:00.000Z") },
      bot: { enabled: true, pausedUntil: null, takeoverMinutes: 60 },
      cart: { count: 2, totalCentavos: 25500 },
      order: { id: "o1", label: "#03" },
    });
    expect(parsed?.chips).toEqual([
      { card: "cart", label: "Send checkout · ₱255" },
      { card: "pay", label: "How to pay", orderId: "o1" },
    ]);
  });

  it("refuses an answer without the window or bot", () => {
    expect(parseStaffChatTools(null)).toBeNull();
    expect(parseStaffChatTools({ chips: [] })).toBeNull();
  });
});

describe("stillPending", () => {
  const sent: PendingReply = { clientId: "a", text: "Ready na po!", createdAt: NOW, status: "sent" };
  const line = (id: string, body: string, sentAt: number, direction: ChatMessage["direction"] = "staff"): ChatMessage =>
    ({ id, direction, kind: "text", body, sentAt });

  it("drops a sent reply once the log shows it", () => {
    expect(stillPending([sent], [line("m1", "Ready na po!", NOW + 2000)])).toEqual([]);
  });

  it("keeps it while the log doesn't, and never matches an old line or a customer line", () => {
    expect(stillPending([sent], [line("m1", "Ready na po!", NOW - 10 * MIN)])).toHaveLength(1);
    expect(stillPending([sent], [line("m1", "Ready na po!", NOW, "in")])).toHaveLength(1);
  });

  it("matches one line per reply when the same words are sent twice", () => {
    const again = { ...sent, clientId: "b" };
    expect(stillPending([sent, again], [line("m1", "Ready na po!", NOW + 1000)])).toEqual([again]);
  });

  it("never drops a sending or failed reply", () => {
    const failed: PendingReply = { ...sent, clientId: "c", status: "failed" };
    const sending: PendingReply = { ...sent, clientId: "d", status: "sending" };
    expect(stillPending([failed, sending], [line("m1", "Ready na po!", NOW + 1000)])).toEqual([failed, sending]);
  });
});

describe("windowNote", () => {
  it("stays quiet most of the day and warns when the window is closing", () => {
    expect(windowNote(tools({ window: { isOpen: true, endsAt: NOW + 10 * 60 * MIN } }), NOW)).toBeNull();
    expect(windowNote(tools({ window: { isOpen: true, endsAt: NOW + 150 * MIN } }), NOW)).toMatch(/^You can reply for 3 h more/);
    expect(windowNote(tools({ window: { isOpen: true, endsAt: NOW + 20 * MIN } }), NOW)).toMatch(/^You can reply for 20 min more/);
  });
});

describe("botSwitch", () => {
  it("shows the pause from the server, or from the chat when tools haven't loaded", () => {
    expect(botSwitch(tools(), null, NOW)).toEqual({ isPaused: false, label: "Bot on", actionLabel: "Pause bot" });
    expect(botSwitch(tools({ bot: { enabled: true, pausedUntil: NOW + 42 * MIN, takeoverMinutes: 60 } }), null, NOW))
      .toEqual({ isPaused: true, label: "Bot paused · 42 min", actionLabel: "Turn bot back on" });
    expect(botSwitch(null, NOW + 3 * 60 * MIN, NOW).label).toBe("Bot paused · 3 h");
  });

  it("offers no switch when the store turned the bot off", () => {
    expect(botSwitch(tools({ bot: { enabled: false, pausedUntil: null, takeoverMinutes: 60 } }), null, NOW).actionLabel).toBe("");
  });
});

describe("lockReason", () => {
  it("locks after 24 hours, before a first message, and without a Page", () => {
    expect(lockReason(tools())).toBeNull();
    expect(lockReason(tools({ window: { isOpen: false, endsAt: NOW - MIN } }))).toMatch(/over 24 hours/);
    expect(lockReason(tools({ window: { isOpen: false, endsAt: null } }))).toMatch(/haven't written/);
    expect(lockReason(tools({ blocked: "no_page" }))).toMatch(/not connected/);
  });

  it("doesn't lock before the tools load", () => {
    expect(lockReason(null)).toBeNull();
  });
});

describe("newClientId", () => {
  it("fits the server's pattern", () => {
    expect(newClientId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(newClientId()).not.toBe(newClientId());
  });
});

describe("describePreview", () => {
  it("names each message", () => {
    expect(describePreview([
      { kind: "text", text: "Hi John" },
      { kind: "cards", cards: [{ title: "Menu" }, { title: "Drinks" }] },
    ])).toEqual(["Hi John", "Menu · Drinks"]);
  });
});
