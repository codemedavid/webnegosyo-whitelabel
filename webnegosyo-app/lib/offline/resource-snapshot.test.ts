import AsyncStorage from "@react-native-async-storage/async-storage";
import { getConnectivity, resetConnectivityForTests } from "./connectivity";
import {
  RESOURCE_SNAPSHOT_PREFIX,
  readResourceSnapshot,
  resetResourceSnapshotsForTests,
  resourceSnapshotKey,
  withOfflineSnapshot,
} from "./resource-snapshot";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("withOfflineSnapshot", () => {
  const key = resourceSnapshotKey(["resource", "pos-catalog", "tenant-1", "store"]);

  beforeEach(() => {
    jest.clearAllMocks();
    resetConnectivityForTests();
    resetResourceSnapshotsForTests();
    storage.setItem.mockResolvedValue(undefined);
  });

  it("derives a tenant-scoped storage key from the cache key", () => {
    expect(key).toBe(`${RESOURCE_SNAPSHOT_PREFIX}resource:pos-catalog:tenant-1:store`);
  });

  it("answers from the server and remembers the answer", async () => {
    const fetcher = jest.fn().mockResolvedValue({ items: [1] });
    await expect(withOfflineSnapshot(key, fetcher, { now: () => 5 })).resolves.toEqual({ items: [1] });
    await flush();
    expect(storage.setItem).toHaveBeenCalledWith(key, JSON.stringify({ savedAt: 5, value: { items: [1] } }));
    expect(getConnectivity().status).toBe("online");
  });

  it("does not touch the disk again while the answer is unchanged", async () => {
    const fetcher = jest.fn().mockResolvedValue({ items: [1] });
    await withOfflineSnapshot(key, fetcher, { now: () => 5 });
    await withOfflineSnapshot(key, fetcher, { now: () => 5 });
    await flush();
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    fetcher.mockResolvedValue({ items: [1, 2] });
    await withOfflineSnapshot(key, fetcher, { now: () => 6 });
    await flush();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it("answers from the snapshot when the server cannot be reached, and goes offline", async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({ savedAt: 1, value: { items: [7] } }));
    const fetcher = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    await expect(withOfflineSnapshot(key, fetcher)).resolves.toEqual({ items: [7] });
    expect(getConnectivity().status).toBe("offline");
  });

  it("rethrows when there is nothing remembered — an empty register must say so", async () => {
    storage.getItem.mockResolvedValue(null);
    const failure = new TypeError("Network request failed");
    await expect(withOfflineSnapshot(key, () => Promise.reject(failure))).rejects.toBe(failure);
  });

  it("a server refusal still falls back but leaves the belief online", async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({ savedAt: 1, value: [] }));
    await expect(
      withOfflineSnapshot(key, () => Promise.reject(new Error("permission denied")))
    ).resolves.toEqual([]);
    expect(getConnectivity().status).toBe("online");
  });

  it("retries the disk write on the next success after a failed one", async () => {
    storage.setItem.mockRejectedValueOnce(new Error("disk full"));
    const fetcher = jest.fn().mockResolvedValue("v");
    await withOfflineSnapshot(key, fetcher, { now: () => 1 });
    await flush();
    await withOfflineSnapshot(key, fetcher, { now: () => 1 });
    await flush();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it("ignores corrupt or malformed snapshots", async () => {
    storage.getItem.mockResolvedValue("{oops");
    await expect(readResourceSnapshot(key)).resolves.toBeNull();
    storage.getItem.mockResolvedValue(JSON.stringify({ value: 1 }));
    await expect(readResourceSnapshot(key)).resolves.toBeNull();
  });
});
