import {
  CONSUMED_STORAGE_KEY,
  CONSUMED_TTL_MS,
  MAX_AUTO_COMMIT_AGE_MS,
  planPushRoute,
  readConsumed,
  rememberConsumed,
  type KeyValueStore,
} from "./push-consumed";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => {
      data[key] = value;
    },
  };
}

const NOW = 1_760_000_000_000;
const approve = { type: "approval_request", approvalId: "req-1", tenantId: "t-1" };

describe("consumed push responses survive a restart", () => {
  test("a remembered response reads back as consumed; old entries are pruned on write", async () => {
    const store = memoryStore({
      [CONSUMED_STORAGE_KEY]: JSON.stringify({ "old:approve": NOW - CONSUMED_TTL_MS - 1 }),
    });
    await rememberConsumed(store, "n1:approve", NOW);
    expect(JSON.parse(store.data[CONSUMED_STORAGE_KEY])).toEqual({ "n1:approve": NOW });
    expect(await readConsumed(store, NOW + 1000)).toEqual({ status: "read", keys: ["n1:approve"] });
  });

  test("an unreadable store is reported, never mistaken for empty", async () => {
    const broken: KeyValueStore = { getItem: async () => Promise.reject(new Error("io")), setItem: async () => undefined };
    expect(await readConsumed(broken, NOW)).toEqual({ status: "unknown", keys: [] });
    expect(await readConsumed(memoryStore({ [CONSUMED_STORAGE_KEY]: "{not json" }), NOW)).toEqual({ status: "read", keys: [] });
  });
});

describe("planPushRoute", () => {
  const base = { data: approve, actionIdentifier: "approve", key: "n1:approve", notifiedAt: NOW - 10_000, now: NOW };

  test("a fresh Approve opens the review screen in the approving state", () => {
    expect(planPushRoute({ ...base, consumed: { status: "read", keys: [] } })).toBe("/(main)/approval/req-1?intent=approve");
  });

  test("a response already handled (even before a restart) opens nothing", () => {
    expect(planPushRoute({ ...base, consumed: { status: "read", keys: ["n1:approve"] } })).toBeNull();
  });

  test("an Approve older than 2 minutes opens the review screen without the countdown", () => {
    expect(
      planPushRoute({ ...base, notifiedAt: NOW - MAX_AUTO_COMMIT_AGE_MS - 1, consumed: { status: "read", keys: [] } }),
    ).toBe("/(main)/approval/req-1");
  });

  test("when the consumed list cannot be read, Approve never auto-commits", () => {
    expect(planPushRoute({ ...base, consumed: { status: "unknown", keys: [] } })).toBe("/(main)/approval/req-1");
  });

  test("a delivery time in seconds is understood", () => {
    expect(planPushRoute({ ...base, notifiedAt: Math.floor((NOW - 10_000) / 1000), consumed: { status: "read", keys: [] } })).toBe(
      "/(main)/approval/req-1?intent=approve",
    );
  });

  test("Decline and plain taps still route; non-approval pushes are untouched", () => {
    expect(planPushRoute({ ...base, actionIdentifier: "decline", key: "n1:decline", consumed: { status: "read", keys: [] } })).toBe(
      "/(main)/approval/req-1?intent=decline",
    );
    expect(planPushRoute({ ...base, data: { announcementId: "a1", kind: "post" }, consumed: { status: "read", keys: [] } })).toBe(
      "/(main)/whats-new/a1",
    );
  });

  test("stock alerts and texting pushes route through the same plan (one push router)", () => {
    const fresh = { status: "read" as const, keys: [] };
    expect(planPushRoute({ ...base, actionIdentifier: null, data: { type: "stock_alert", inventoryItemId: "inv-1" }, consumed: fresh })).toBe(
      "/(main)/ingredient/inv-1",
    );
    expect(planPushRoute({ ...base, actionIdentifier: null, data: { kind: "sms_texts_waiting" }, consumed: fresh })).toBe("/(main)/texts");
    expect(planPushRoute({ ...base, actionIdentifier: null, data: { campaignId: "c1" }, consumed: fresh })).toBe("/(main)/campaign/c1");
    expect(planPushRoute({ ...base, actionIdentifier: null, data: { orderId: "o1" }, consumed: fresh })).toBeNull();
  });
});
