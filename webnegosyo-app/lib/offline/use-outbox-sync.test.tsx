import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

const mockAuth = { tenantId: "t1", impersonatedTenantId: null, userId: "u1", isDemo: false, isAuthenticated: true, orderBackend: "platform", convexUrl: null };
const mockSync = jest.fn().mockResolvedValue({ synced: 0 });
const mockHydrate = jest.fn().mockResolvedValue(undefined);
const mockOutbox = { sales: [], isHydrated: true };
jest.mock("../../stores/auth-store", () => ({ useAuthStore: Object.assign((selector: (state: typeof mockAuth) => unknown) => selector(mockAuth), { getState: () => mockAuth }) }));
jest.mock("../hooks", () => ({ useSafeMutation: () => async () => undefined }));
jest.mock("./sync-outbox", () => ({ syncOutbox: (...args: unknown[]) => mockSync(...args) }));
jest.mock("./order-outbox", () => ({
  getOutbox: () => mockOutbox,
  hydrateOutbox: () => mockHydrate(),
  subscribeOutbox: () => () => {},
  needsAttention: () => false,
}));
jest.mock("./use-connectivity", () => ({ useConnectivity: () => ({ status: "online" }) }));
const mockSyncEdits = jest.fn().mockResolvedValue({ synced: 0 });
jest.mock("./sync-order-edits", () => ({ syncOrderEdits: (...args: unknown[]) => mockSyncEdits(...args) }));
const mockEditsState = { edits: [], isHydrated: true };
jest.mock("./order-edits", () => ({
  getOrderEdits: () => mockEditsState,
  hydrateOrderEdits: () => Promise.resolve(),
  subscribeOrderEdits: () => () => {},
  isOrderEditStuck: () => false,
}));
import { OUTBOX_RETRY_INTERVAL_MS, useOutboxSync } from "./use-outbox-sync";

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  AppState.currentState = "active";
});
afterEach(() => jest.useRealTimers());

it("keeps a run active across ordinary rerenders and retries periodically", async () => {
  const { rerender, unmount } = renderHook(() => useOutboxSync());
  await act(async () => {});
  expect(mockSync).toHaveBeenCalledTimes(1);
  const scope = mockSync.mock.calls[0][0];
  rerender({});
  await act(async () => {});
  expect(scope.isActive()).toBe(true);
  expect(mockSync).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(OUTBOX_RETRY_INTERVAL_MS); });
  expect(mockSync).toHaveBeenCalledTimes(2);
  unmount();
  expect(scope.isActive()).toBe(false);
  await act(async () => { jest.advanceTimersByTime(OUTBOX_RETRY_INTERVAL_MS); });
  expect(mockSync).toHaveBeenCalledTimes(2);
});

it("replays order changes after the sales, through the screens' mutations", async () => {
  mockSync.mockResolvedValueOnce({ synced: 1, stoppedOffline: false });
  const { unmount } = renderHook(() => useOutboxSync());
  await act(async () => {});
  expect(mockSyncEdits).toHaveBeenCalledTimes(1);
  expect(mockSync.mock.invocationCallOrder[0]).toBeLessThan(mockSyncEdits.mock.invocationCallOrder[0]);
  expect(mockSyncEdits.mock.calls[0][0]).toMatchObject({ tenantId: "t1", backend: "platform" });
  unmount();
});

it("leaves order changes queued when the sales run lost the connection", async () => {
  mockSync.mockResolvedValueOnce({ synced: 0, stoppedOffline: true });
  const { unmount } = renderHook(() => useOutboxSync());
  await act(async () => {});
  expect(mockSyncEdits).not.toHaveBeenCalled();
  unmount();
});
