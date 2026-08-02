/**
 * The device id backs the run claim, so the only properties that matter are
 * that it is stable across calls, persisted across launches, and never blocks a
 * send when storage misbehaves.
 */

const store = new Map<string, string>();
let getShouldThrow = false;
let setShouldThrow = false;

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => {
      if (getShouldThrow) throw new Error("storage unavailable");
      return store.get(key) ?? null;
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      if (setShouldThrow) throw new Error("storage full");
      store.set(key, value);
    }),
  },
}));

import { getDeviceId, resetDeviceIdCache } from "./device-id";

beforeEach(() => {
  store.clear();
  getShouldThrow = false;
  setShouldThrow = false;
  resetDeviceIdCache();
});

describe("getDeviceId", () => {
  it("returns the same id twice in one session", async () => {
    const first = await getDeviceId();
    const second = await getDeviceId();

    expect(second).toBe(first);
  });

  it("persists the id so it survives an app restart", async () => {
    const first = await getDeviceId();

    // A restart clears the in-memory cache but not storage. The id must
    // survive, or a relaunched app cannot recognise the run it already claimed.
    resetDeviceIdCache();

    expect(await getDeviceId()).toBe(first);
  });

  it("reuses an id already in storage rather than minting a new one", async () => {
    store.set("sms.deviceId", "dev_existing");

    expect(await getDeviceId()).toBe("dev_existing");
  });

  it("hands back a usable id even when storage cannot be read", async () => {
    getShouldThrow = true;

    const id = await getDeviceId();

    // A session-only id still distinguishes two DEVICES, which is all the
    // claim needs; refusing to produce one would block sending entirely.
    expect(id).toMatch(/^dev_/);
  });

  it("hands back a usable id even when storage cannot be written", async () => {
    setShouldThrow = true;

    expect(await getDeviceId()).toMatch(/^dev_/);
  });

  it("stays stable within the session when the write failed", async () => {
    setShouldThrow = true;

    const first = await getDeviceId();

    expect(await getDeviceId()).toBe(first);
  });

  it("gives two installations different ids", async () => {
    const first = await getDeviceId();

    store.clear();
    resetDeviceIdCache();

    expect(await getDeviceId()).not.toBe(first);
  });
});
