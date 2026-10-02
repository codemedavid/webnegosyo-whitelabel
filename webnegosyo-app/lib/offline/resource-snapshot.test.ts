import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getConnectivity,
  reportOffline,
  resetConnectivityForTests,
} from "./connectivity";
import {
  RESOURCE_SNAPSHOT_PREFIX,
  readResourceSnapshot,
  resetResourceSnapshotsForTests,
  resourceSnapshotKey,
  saveResourceSnapshot,
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
    await withOfflineSnapshot(key, fetcher, { now: () => 6 });
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

  it("does not bypass a server refusal with cached data", async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({ savedAt: 1, value: [] }));
    await expect(
      withOfflineSnapshot(key, () => Promise.reject(new Error("permission denied")))
    ).rejects.toThrow("permission denied");
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

  it("answers from the snapshot at once while the device is known to be offline", async () => {
    reportOffline(1);
    storage.getItem.mockResolvedValue(JSON.stringify({ savedAt: 1, value: { items: [7] } }));
    const fetcher = jest.fn().mockResolvedValue({ items: [8] });
    await expect(withOfflineSnapshot(key, fetcher)).resolves.toEqual({ items: [7] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("still asks the server while offline when nothing is saved yet", async () => {
    reportOffline(1);
    storage.getItem.mockResolvedValue(null);
    const fetcher = jest.fn().mockResolvedValue({ items: [8] });
    await expect(withOfflineSnapshot(key, fetcher)).resolves.toEqual({ items: [8] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves the snapshot when the server is too slow, and saves the late answer", async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({ savedAt: 1, value: { items: [7] } }));
    let answer: (value: unknown) => void = () => {};
    const fetcher = jest.fn(() => new Promise((resolve) => { answer = resolve; }));

    await expect(withOfflineSnapshot(key, fetcher, { now: () => 9, deadlineMs: 5 })).resolves.toEqual({
      items: [7],
    });

    answer({ items: [9] });
    await flush();
    expect(storage.setItem).toHaveBeenCalledWith(key, JSON.stringify({ savedAt: 9, value: { items: [9] } }));
  });

  it("keeps waiting for a slow server when there is no snapshot to fall back on", async () => {
    storage.getItem.mockResolvedValue(null);
    const fetcher = jest.fn(
      () => new Promise((resolve) => setTimeout(() => resolve({ items: [3] }), 20))
    );
    await expect(withOfflineSnapshot(key, fetcher, { deadlineMs: 5 })).resolves.toEqual({ items: [3] });
  });

  it("swallows a late network failure after the snapshot was served", async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({ savedAt: 1, value: "saved" }));
    let fail: (error: unknown) => void = () => {};
    const fetcher = jest.fn(() => new Promise((_, reject) => { fail = reject; }));
    await expect(withOfflineSnapshot(key, fetcher, { deadlineMs: 5 })).resolves.toBe("saved");
    fail(new TypeError("Network request failed"));
    await flush();
    // Reported as offline, but nothing throws out of the abandoned read.
    expect(getConnectivity().status).toBe("offline");
  });
});

describe("saveResourceSnapshot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetResourceSnapshotsForTests();
  });

  it("writes the value and resolves once it is on disk", async () => {
    storage.setItem.mockResolvedValue(undefined);
    await saveResourceSnapshot("k", { a: 1 }, 42);
    expect(storage.setItem).toHaveBeenCalledWith("k", JSON.stringify({ savedAt: 42, value: { a: 1 } }));
  });

  it("rejects when the disk refuses, so a download never claims a copy it lacks", async () => {
    storage.setItem.mockRejectedValue(new Error("disk full"));
    await expect(saveResourceSnapshot("k", { a: 1 }, 42)).rejects.toThrow("disk full");
  });

  it("always rewrites, so the saved time moves forward even when nothing changed", async () => {
    storage.setItem.mockResolvedValue(undefined);
    await saveResourceSnapshot("k", { a: 1 }, 1);
    await saveResourceSnapshot("k", { a: 1 }, 2);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });
});
