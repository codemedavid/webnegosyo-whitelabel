/**
 * The register's offline download.
 *
 * Before this, a register could only sell offline from what its screens had
 * happened to read while online — a device that logged in and never opened the
 * register, or never charged a Takeout sale, went offline with no menu or no
 * payment methods. The download saves every register read up front, into the
 * live cache AND onto the disk, and says honestly what it could not save.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getConnectivity, resetConnectivityForTests } from "./connectivity";
import { resetResourceSnapshotsForTests, resourceSnapshotKey } from "./resource-snapshot";
import {
  downloadOfflinePack,
  offlinePackKey,
  readOfflinePackManifest,
  shouldRefreshOfflinePack,
  OFFLINE_PACK_REFRESH_MS,
  type OfflinePackPart,
} from "./offline-pack";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

const MENU_KEY = ["resource", "pos-catalog", "t1", "store"] as const;
const METHODS_KEY = ["resource", "pos-payment-methods", "t1", "register"] as const;
const TABLES_KEY = ["resource", "dining-tables", "t1"] as const;

function parts(overrides: Partial<Record<string, () => Promise<unknown>>> = {}): OfflinePackPart[] {
  return [
    {
      label: "menu",
      key: MENU_KEY,
      isRequired: true,
      fetch: overrides.menu ?? (() => Promise.resolve({ items: [{}, {}, {}], categories: [] })),
    },
    {
      label: "payment methods",
      key: METHODS_KEY,
      isRequired: true,
      fetch: overrides.methods ?? (() => Promise.resolve([{ id: "cash" }, { id: "gcash" }])),
    },
    {
      label: "tables",
      key: TABLES_KEY,
      isRequired: false,
      fetch: overrides.tables ?? (() => Promise.resolve([])),
    },
  ];
}

function summarize(values: ReadonlyMap<string, unknown>) {
  const menu = values.get("menu") as { items: unknown[] } | undefined;
  const methods = values.get("payment methods") as unknown[] | undefined;
  return { items: menu?.items.length ?? 0, paymentMethods: methods?.length ?? 0 };
}

function fakeClient() {
  return { setQueryData: jest.fn() };
}

const PACK_KEY = offlinePackKey("t1", null);

beforeEach(() => {
  jest.clearAllMocks();
  resetConnectivityForTests();
  resetResourceSnapshotsForTests();
  storage.setItem.mockResolvedValue(undefined);
  storage.getItem.mockResolvedValue(null);
});

describe("offlinePackKey", () => {
  it("is per tenant and per branch, so a branch never sells another's saved menu", () => {
    expect(offlinePackKey("t1", null)).not.toBe(offlinePackKey("t1", "o-north"));
    expect(offlinePackKey("t1", "o-north")).not.toBe(offlinePackKey("t2", "o-north"));
  });
});

describe("downloadOfflinePack", () => {
  it("saves every part to the cache and the disk, then records what was saved", async () => {
    const client = fakeClient();
    const result = await downloadOfflinePack({
      client,
      parts: parts(),
      packKey: PACK_KEY,
      summarize,
      now: () => 100,
    });

    expect(result.isComplete).toBe(true);
    expect(result.failed).toEqual([]);
    expect(client.setQueryData).toHaveBeenCalledWith(MENU_KEY, { items: [{}, {}, {}], categories: [] });
    expect(client.setQueryData).toHaveBeenCalledWith(METHODS_KEY, [{ id: "cash" }, { id: "gcash" }]);
    expect(storage.setItem).toHaveBeenCalledWith(
      resourceSnapshotKey(METHODS_KEY),
      JSON.stringify({ savedAt: 100, value: [{ id: "cash" }, { id: "gcash" }] }),
    );
    expect(result.manifest).toEqual({
      savedAt: 100,
      summary: { items: 3, paymentMethods: 2 },
      missing: [],
    });
    expect(storage.setItem).toHaveBeenCalledWith(PACK_KEY, JSON.stringify(result.manifest));
    expect(getConnectivity().status).toBe("online");
  });

  it("is not complete — and keeps the previous record — when a required part fails", async () => {
    const client = fakeClient();
    const result = await downloadOfflinePack({
      client,
      parts: parts({ methods: () => Promise.reject(new TypeError("Network request failed")) }),
      packKey: PACK_KEY,
      summarize,
      now: () => 100,
    });

    expect(result.isComplete).toBe(false);
    expect(result.failed).toEqual(["payment methods"]);
    expect(result.manifest).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalledWith(PACK_KEY, expect.anything());
    // What did arrive is still saved: a fresher menu is never worse.
    expect(storage.setItem).toHaveBeenCalledWith(resourceSnapshotKey(MENU_KEY), expect.any(String));
    // The menu answered, so the server is reachable.
    expect(getConnectivity().status).toBe("online");
  });

  it("reports offline when nothing could reach the server", async () => {
    const lost = () => Promise.reject(new TypeError("Network request failed"));
    const result = await downloadOfflinePack({
      client: fakeClient(),
      parts: parts({ menu: lost, methods: lost, tables: lost }),
      packKey: PACK_KEY,
      summarize,
    });

    expect(result.isComplete).toBe(false);
    expect(result.failed).toEqual(["menu", "payment methods", "tables"]);
    expect(getConnectivity().status).toBe("offline");
  });

  it("is complete without an optional part, and names it as missing", async () => {
    const result = await downloadOfflinePack({
      client: fakeClient(),
      parts: parts({ tables: () => Promise.reject(new Error("permission denied")) }),
      packKey: PACK_KEY,
      summarize,
      now: () => 100,
    });

    expect(result.isComplete).toBe(true);
    expect(result.failed).toEqual(["tables"]);
    expect(result.manifest?.missing).toEqual(["tables"]);
  });

  it("counts a part that could not be written to the disk as failed", async () => {
    storage.setItem.mockImplementation((key: string) =>
      key === resourceSnapshotKey(MENU_KEY) ? Promise.reject(new Error("disk full")) : Promise.resolve(),
    );
    const result = await downloadOfflinePack({
      client: fakeClient(),
      parts: parts(),
      packKey: PACK_KEY,
      summarize,
      now: () => 100,
    });

    expect(result.isComplete).toBe(false);
    expect(result.failed).toEqual(["menu"]);
  });

  it("gives up on a part that never answers", async () => {
    const result = await downloadOfflinePack({
      client: fakeClient(),
      parts: parts({ menu: () => new Promise(() => undefined) }),
      packKey: PACK_KEY,
      summarize,
      now: () => 100,
      timeoutMs: 5,
    });

    expect(result.isComplete).toBe(false);
    expect(result.failed).toEqual(["menu"]);
  });
});

describe("readOfflinePackManifest", () => {
  it("reads back what the download recorded", async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({ savedAt: 5, summary: { items: 1, paymentMethods: 2 }, missing: [] }),
    );
    await expect(readOfflinePackManifest(PACK_KEY)).resolves.toEqual({
      savedAt: 5,
      summary: { items: 1, paymentMethods: 2 },
      missing: [],
    });
  });

  it("treats a missing or corrupt record as never downloaded", async () => {
    storage.getItem.mockResolvedValue(null);
    await expect(readOfflinePackManifest(PACK_KEY)).resolves.toBeNull();
    storage.getItem.mockResolvedValue("{nope");
    await expect(readOfflinePackManifest(PACK_KEY)).resolves.toBeNull();
    storage.getItem.mockResolvedValue(JSON.stringify({ savedAt: "x" }));
    await expect(readOfflinePackManifest(PACK_KEY)).resolves.toBeNull();
  });
});

describe("shouldRefreshOfflinePack", () => {
  const NOW = 10 * OFFLINE_PACK_REFRESH_MS;

  it("downloads on the first chance of a session", () => {
    expect(shouldRefreshOfflinePack({ reason: "start", lastAttemptAt: null, now: NOW })).toBe(true);
    expect(shouldRefreshOfflinePack({ reason: "start", lastAttemptAt: NOW - 1, now: NOW })).toBe(false);
  });

  it("always refreshes when the connection comes back", () => {
    expect(shouldRefreshOfflinePack({ reason: "reconnect", lastAttemptAt: NOW - 1, now: NOW })).toBe(true);
  });

  it("refreshes on foreground only once the saved copy has aged", () => {
    expect(
      shouldRefreshOfflinePack({ reason: "foreground", lastAttemptAt: NOW - 1, now: NOW }),
    ).toBe(false);
    expect(
      shouldRefreshOfflinePack({
        reason: "foreground",
        lastAttemptAt: NOW - OFFLINE_PACK_REFRESH_MS,
        now: NOW,
      }),
    ).toBe(true);
  });
});
