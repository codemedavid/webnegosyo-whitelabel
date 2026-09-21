import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SessionAuthPatch } from "../session-resolve";
import {
  SESSION_SNAPSHOT_KEY,
  bindSessionSnapshotToAuth,
  clearSessionSnapshot,
  isRetryableSessionError,
  loadSessionSnapshot,
  saveSessionSnapshot,
} from "./session-snapshot";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

const merchant: SessionAuthPatch = {
  userId: "user-1",
  tenantId: "tenant-1",
  tenantSlug: "cafe",
  tenantName: "Cafe",
  convexUrl: null,
  convexSchemaVersion: null,
  orderBackend: "platform",
  receiptLayout: { theme: "modern" },
  receiptLogoUrl: null,
  customerHubEnabled: false,
  loyaltyEnabled: false,
  isLoading: false,
  isAuthenticated: true,
  isSuperadmin: false,
  isOwner: true,
  permissions: null,
  role: "admin",
  outletId: null,
  outletName: null,
  defaultTab: null,
};

describe("session snapshot", () => {
  beforeEach(() => jest.clearAllMocks());

  it("saves a merchant session under a versioned key", async () => {
    await saveSessionSnapshot(merchant, 1000);
    expect(storage.setItem).toHaveBeenCalledWith(
      SESSION_SNAPSHOT_KEY,
      JSON.stringify({ version: 1, savedAt: 1000, auth: merchant })
    );
  });

  it("never saves a superadmin session — the platform surface needs the server anyway", async () => {
    await saveSessionSnapshot({ ...merchant, isSuperadmin: true, tenantId: null }, 1);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("restores the saved session for the same user", async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({ version: 1, savedAt: 1, auth: merchant }));
    await expect(loadSessionSnapshot("user-1")).resolves.toEqual(merchant);
  });

  it("refuses another user's snapshot and unreadable storage", async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({ version: 1, savedAt: 1, auth: merchant }));
    await expect(loadSessionSnapshot("someone-else")).resolves.toBeNull();

    storage.getItem.mockResolvedValue("{not json");
    await expect(loadSessionSnapshot("user-1")).resolves.toBeNull();

    storage.getItem.mockResolvedValue(JSON.stringify({ version: 99, auth: merchant }));
    await expect(loadSessionSnapshot("user-1")).resolves.toBeNull();
  });

  it("restores without an id when GoTrue could not say who is signed in", async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({ version: 1, savedAt: 1, auth: merchant }));
    await expect(loadSessionSnapshot(null)).resolves.toEqual(merchant);
  });

  it("clears on sign-out and survives a storage failure", async () => {
    let handler: ((event: string) => void) | undefined;
    bindSessionSnapshotToAuth({
      onAuthStateChange: (cb) => {
        handler = cb;
      },
    });
    handler?.("TOKEN_REFRESHED");
    expect(storage.removeItem).not.toHaveBeenCalled();
    handler?.("SIGNED_OUT");
    expect(storage.removeItem).toHaveBeenCalledWith(SESSION_SNAPSHOT_KEY);

    storage.removeItem.mockRejectedValueOnce(new Error("disk"));
    await expect(clearSessionSnapshot()).resolves.toBeUndefined();
  });

  it("tells GoTrue's unreachable-refresh apart from no session at all", () => {
    expect(isRetryableSessionError({ name: "AuthRetryableFetchError" })).toBe(true);
    expect(isRetryableSessionError({ name: "AuthSessionMissingError" })).toBe(false);
    expect(isRetryableSessionError(null)).toBe(false);
  });
});
