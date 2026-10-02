/**
 * The offline download's shared state: one download per register scope at a
 * time, and a status every screen reads the same way.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockMenuFetch = jest.fn();
jest.mock("./register-pack", () => ({
  registerPackParts: () => [
    { label: "menu", key: ["resource", "pos-catalog", "t1", "store"], fetch: mockMenuFetch, isRequired: true },
  ],
  summarizeRegisterPack: (values: ReadonlyMap<string, unknown>) => ({
    items: (values.get("menu") as unknown[] | undefined)?.length ?? 0,
  }),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

import {
  getOfflinePackState,
  lastOfflinePackAttempt,
  loadOfflinePackManifest,
  resetOfflinePackStoreForTests,
  runOfflinePackDownload,
  subscribeOfflinePack,
} from "./offline-pack-store";
import { offlinePackKey } from "./offline-pack";
import { resetConnectivityForTests } from "./connectivity";
import { resetResourceSnapshotsForTests } from "./resource-snapshot";

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const SCOPE = { tenantId: "t1", paymentTenantId: "t1", outletId: null };
const PACK_KEY = offlinePackKey("t1", null);
const client = { setQueryData: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  resetOfflinePackStoreForTests();
  resetConnectivityForTests();
  resetResourceSnapshotsForTests();
  storage.getItem.mockResolvedValue(null);
  storage.setItem.mockResolvedValue(undefined);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  (console.warn as jest.Mock).mockRestore();
});

describe("offline pack store", () => {
  it("starts unloaded, then reads the saved record once", async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({ savedAt: 7, summary: { items: 4 }, missing: [] }),
    );
    expect(getOfflinePackState(PACK_KEY).isLoaded).toBe(false);

    await loadOfflinePackManifest(PACK_KEY);
    await loadOfflinePackManifest(PACK_KEY);

    expect(getOfflinePackState(PACK_KEY)).toMatchObject({
      isLoaded: true,
      manifest: { savedAt: 7, summary: { items: 4 } },
    });
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  it("downloads once however many callers ask at the same time", async () => {
    mockMenuFetch.mockResolvedValue([1, 2]);
    const first = runOfflinePackDownload({ client, scope: SCOPE, now: () => 50 });
    const second = runOfflinePackDownload({ client, scope: SCOPE, now: () => 51 });
    expect(getOfflinePackState(PACK_KEY).isDownloading).toBe(true);

    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(mockMenuFetch).toHaveBeenCalledTimes(1);
    expect(getOfflinePackState(PACK_KEY)).toMatchObject({
      isLoaded: true,
      isDownloading: false,
      manifest: { savedAt: 50, summary: { items: 2 } },
      lastFailed: [],
    });
    expect(lastOfflinePackAttempt(PACK_KEY)).toBe(50);
  });

  it("keeps the previous copy and names the failure when a download fails", async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({ savedAt: 7, summary: { items: 4 }, missing: [] }),
    );
    await loadOfflinePackManifest(PACK_KEY);
    mockMenuFetch.mockRejectedValue(new TypeError("Network request failed"));

    await runOfflinePackDownload({ client, scope: SCOPE, now: () => 60 });

    expect(getOfflinePackState(PACK_KEY)).toMatchObject({
      isDownloading: false,
      manifest: { savedAt: 7 },
      lastFailed: ["menu"],
    });
  });

  it("tells subscribers about every change", async () => {
    mockMenuFetch.mockResolvedValue([1]);
    const listener = jest.fn();
    const unsubscribe = subscribeOfflinePack(listener);

    await runOfflinePackDownload({ client, scope: SCOPE, now: () => 1 });
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2); // started, finished
  });
});
