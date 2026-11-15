import { PSID_CHUNK } from "./chat";
import {
  CHATS_PAGE,
  fetchChatOrders,
  fetchChats,
  fetchChatThread,
  fetchOlderMessages,
  fetchSessionsByPsid,
  THREAD_PAGE,
  type ChatDb,
  type DbResult,
} from "./repo";

const ok = (data: unknown): Promise<DbResult> => Promise.resolve({ data, error: null });
const failed = (): Promise<DbResult> => Promise.resolve({ data: null, error: { message: "boom" } });

function db(overrides: Partial<ChatDb> = {}): ChatDb {
  return {
    sessionsByPsid: () => ok([]),
    sessionById: () => ok(null),
    messages: () => ok([]),
    chats: () => ok([]),
    chatOrders: () => ok([]),
    ...overrides,
  };
}

const line = (id: string, sentAt: string, direction = "in") => ({ id, direction, kind: "text", body: `line ${id}`, sent_at: sentAt });

describe("fetchSessionsByPsid", () => {
  it("asks nothing when no order came from Messenger", async () => {
    const sessionsByPsid = jest.fn(() => ok([]));
    const result = await fetchSessionsByPsid(db({ sessionsByPsid }), "t1", []);
    expect(result).toEqual({ ok: true, value: new Map() });
    expect(sessionsByPsid).not.toHaveBeenCalled();
  });

  it("keys the chats by PSID, in batches", async () => {
    const psids = Array.from({ length: PSID_CHUNK + 1 }, (_, i) => `p${i}`);
    const sessionsByPsid = jest.fn((_tenant: string, chunk: string[]) => ok(chunk.map((psid) => ({ id: `s-${psid}`, psid, first_name: "Ana" }))));
    const result = await fetchSessionsByPsid(db({ sessionsByPsid }), "t1", psids);
    expect(sessionsByPsid).toHaveBeenCalledTimes(2);
    expect(sessionsByPsid.mock.calls.every(([tenant]) => tenant === "t1")).toBe(true);
    expect(result.ok && result.value.size).toBe(PSID_CHUNK + 1);
    expect(result.ok && result.value.get("p3")?.id).toBe("s-p3");
  });

  it("reads a refused chat as no chat (RLS answers with zero rows)", async () => {
    const result = await fetchSessionsByPsid(db(), "t1", ["p1"]);
    expect(result).toEqual({ ok: true, value: new Map() });
  });

  it("reports a failure instead of saying nobody has a chat", async () => {
    const result = await fetchSessionsByPsid(db({ sessionsByPsid: failed }), "t1", ["p1"]);
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("fetchChatThread", () => {
  const session = { id: "s1", psid: "p1", first_name: "Ana", last_name: "Cruz" };

  it("returns the customer and the lines oldest first", async () => {
    const messages = jest.fn(() => ok([line("b", "2026-11-14T03:05:00Z", "bot"), line("a", "2026-11-14T03:00:00Z")]));
    const result = await fetchChatThread(db({ sessionById: () => ok(session), messages }), "s1");
    expect(messages).toHaveBeenCalledWith("s1", THREAD_PAGE, null);
    expect(result.ok && result.value?.session.firstName).toBe("Ana");
    expect(result.ok && result.value?.messages.map((m) => m.id)).toEqual(["a", "b"]);
    expect(result.ok && result.value?.hasOlder).toBe(false);
  });

  it("knows there may be older lines when the page came back full", async () => {
    const full = Array.from({ length: THREAD_PAGE }, (_, i) => line(`m${i}`, new Date(Date.UTC(2026, 10, 14, 3, i)).toISOString()));
    const result = await fetchChatThread(db({ sessionById: () => ok(session), messages: () => ok(full) }), "s1");
    expect(result.ok && result.value?.hasOlder).toBe(true);
  });

  it("is null when this account may not read the chat", async () => {
    expect(await fetchChatThread(db(), "s1")).toEqual({ ok: true, value: null });
  });

  it("reports a failure of either read", async () => {
    expect(await fetchChatThread(db({ sessionById: failed }), "s1")).toEqual({ ok: false, reason: "unavailable" });
    expect(await fetchChatThread(db({ sessionById: () => ok(session), messages: failed }), "s1")).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("fetchOlderMessages", () => {
  it("pages from the oldest line on screen", async () => {
    const messages = jest.fn(() => ok([line("z", "2026-11-13T03:00:00Z")]));
    const oldest = Date.parse("2026-11-14T03:00:00Z");
    const result = await fetchOlderMessages(db({ messages }), "s1", oldest);
    expect(messages).toHaveBeenCalledWith("s1", THREAD_PAGE, "2026-11-14T03:00:00.000Z");
    expect(result.ok && result.value.messages.map((m) => m.id)).toEqual(["z"]);
  });
});

describe("fetchChats", () => {
  it("lists conversations with their newest order", async () => {
    const chats = jest.fn(() =>
      ok([
        {
          session_id: "s1",
          first_name: "Ana",
          last_message_at: "2026-11-14T03:00:00Z",
          last_message_preview: "Pa-order po",
          order_id: "o1",
          order_daily_number: 7,
          order_status: "preparing",
          order_created_at: "2026-11-14T02:00:00Z",
        },
        { session_id: "s2", first_name: null, last_message_at: "2026-11-14T01:00:00Z", order_id: null },
      ]),
    );
    const result = await fetchChats(db({ chats }), "t1");
    expect(chats).toHaveBeenCalledWith("t1", CHATS_PAGE, null);
    expect(result.ok && result.value.chats).toHaveLength(2);
    expect(result.ok && result.value.chats[0].order).toEqual({
      id: "o1",
      dailyNumber: 7,
      status: "preparing",
      createdAt: Date.parse("2026-11-14T02:00:00Z"),
    });
    expect(result.ok && result.value.chats[1].order).toBeNull();
    expect(result.ok && result.value.hasMore).toBe(false);
  });

  it("pages by the last row's time and reports a failure", async () => {
    const chats = jest.fn(() => ok([]));
    await fetchChats(db({ chats }), "t1", Date.parse("2026-11-14T03:00:00Z"));
    expect(chats).toHaveBeenCalledWith("t1", CHATS_PAGE, "2026-11-14T03:00:00.000Z");
    expect(await fetchChats(db({ chats: failed }), "t1")).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("fetchChatOrders", () => {
  const row = (orderId: string, state = "waiting") => ({
    order_id: orderId,
    state,
    outcome: "sent",
    summary_sent_at: "2026-11-14T03:00:00Z",
    created_at: "2026-11-14T02:59:58Z",
  });

  it("asks nothing when no order on screen was rung up for a chat", async () => {
    const chatOrders = jest.fn(() => ok([]));
    const result = await fetchChatOrders(db({ chatOrders }), []);
    expect(result).toEqual({ ok: true, value: new Map() });
    expect(chatOrders).not.toHaveBeenCalled();
  });

  it("keys the rows by order, asking for each order once, 100 at a time", async () => {
    const ids = Array.from({ length: 130 }, (_, i) => `o${i}`);
    const chatOrders = jest.fn((chunk: string[]) => ok(chunk.slice(0, 1).map((id) => row(id))));
    const result = await fetchChatOrders(db({ chatOrders }), [...ids, "o0"]);
    expect(chatOrders).toHaveBeenCalledTimes(2);
    expect(chatOrders.mock.calls.map(([chunk]) => chunk.length)).toEqual([100, 30]);
    expect(result.ok && [...result.value.keys()]).toEqual(["o0", "o100"]);
    expect(result.ok && result.value.get("o0")?.state).toBe("waiting");
  });

  it("skips a row it cannot read and reports a failed read as a failure", async () => {
    const result = await fetchChatOrders(db({ chatOrders: () => ok([row("o1"), { order_id: "o2", state: "?" }, null]) }), ["o1", "o2"]);
    expect(result.ok && [...result.value.keys()]).toEqual(["o1"]);
    expect(await fetchChatOrders(db({ chatOrders: failed }), ["o1"])).toEqual({ ok: false, reason: "unavailable" });
  });
});
