import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { SafeQueryResult } from "../hooks";
import type { QueuedSale } from "./order-outbox";
import type { QueuedOrderEdit } from "./order-edits";

const mockAuth = {
  tenantId: "t1",
  impersonatedTenantId: null,
  orderBackend: "platform",
  convexUrl: null,
};
let mockStatus: "online" | "offline" | "unknown" = "online";
let mockSales: QueuedSale[] = [];
let mockEdits: QueuedOrderEdit[] = [];
const mockLive = jest.fn();
const mockEnqueueEdit = jest.fn().mockResolvedValue(undefined);
const mockPersist = jest.fn().mockResolvedValue(undefined);
const mockReadSnapshot = jest.fn().mockResolvedValue(null);

jest.mock("../../stores/auth-store", () => ({
  useAuthStore: Object.assign((selector: (state: typeof mockAuth) => unknown) => selector(mockAuth), {
    getState: () => mockAuth,
  }),
}));
jest.mock("../hooks", () => ({ useSafeMutation: () => mockLive }));
jest.mock("../use-branch-scope", () => ({ useAccountBranchScope: () => ({ kind: "all" }) }));
jest.mock("./use-connectivity", () => ({ useConnectivity: () => ({ status: mockStatus }) }));
jest.mock("./connectivity", () => ({
  isOffline: () => mockStatus === "offline",
  reportOffline: jest.fn(),
  reportOnline: jest.fn(),
}));
jest.mock("./use-outbox-sync", () => ({
  useOutbox: () => ({ sales: mockSales, isHydrated: true }),
  useOrderEdits: () => ({ edits: mockEdits, isHydrated: true }),
}));
jest.mock("./order-outbox", () => ({
  ...jest.requireActual("./order-outbox"),
  getOutbox: () => ({ sales: mockSales, isHydrated: true }),
}));
jest.mock("./order-edits", () => ({
  ...jest.requireActual("./order-edits"),
  getOrderEdits: () => ({ edits: mockEdits, isHydrated: true }),
  enqueueOrderEdit: (edit: QueuedOrderEdit) => mockEnqueueEdit(edit),
}));
jest.mock("./resource-snapshot", () => ({
  persistSnapshot: (...args: unknown[]) => mockPersist(...args),
  readResourceSnapshot: (...args: unknown[]) => mockReadSnapshot(...args),
}));

import * as offlineOrders from "./use-offline-orders";
import { isQueuedOrderWrite } from "./write-order-change";

const load = () => offlineOrders;

interface Row {
  _id: string;
  _creationTime: number;
  status: string;
}

function result(overrides: Partial<SafeQueryResult<Row[]>> = {}): SafeQueryResult<Row[]> {
  return {
    data: undefined,
    isLoading: false,
    error: null,
    isMissingFunction: false,
    refetch: async () => {},
    isRefetching: false,
    ...overrides,
  };
}

function sale(localId: string): QueuedSale {
  return {
    localId,
    tenantId: "t1",
    backend: "platform",
    clientOrderId: `pos-${localId}`,
    createdAt: 5_000,
    orderArgs: { customerName: "Walk-in", total: 100, items: [], source: "pos" },
    bookkeeping: {
      stockItems: [],
      loyverseLines: [],
      discountLines: [],
      outletId: null,
      total: 100,
      customerName: "Walk-in",
      customerContact: "",
      customerData: {},
      channel: null,
      captureItems: [],
    },
    attempts: 0,
    lastError: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = "online";
  mockSales = [];
  mockEdits = [];
  mockReadSnapshot.mockResolvedValue(null);
});

describe("useOfflineOrderList", () => {
  it("adds queued sales to the server's list and saves the live answer", async () => {
    mockSales = [sale("local-1")];
    const server = [{ _id: "s1", _creationTime: 9_000, status: "pending" }];
    const { result: hook } = renderHook(() =>
      load().useOfflineOrderList(result({ data: server }), { snapshotName: "orders" })
    );

    expect(hook.current.data?.map((o) => o._id)).toEqual(["s1", "local-1"]);
    expect(hook.current.isOffline).toBe(false);
    await waitFor(() =>
      expect(mockPersist).toHaveBeenCalledWith("offline_orders_v1:t1:all:orders", server, expect.any(Number))
    );
  });

  it("shows the saved list instead of an error while offline", async () => {
    mockStatus = "offline";
    mockReadSnapshot.mockResolvedValue({
      savedAt: 1_000,
      value: [{ _id: "saved-1", _creationTime: 2_000, status: "confirmed" }],
    });
    const { result: hook } = renderHook(() =>
      load().useOfflineOrderList(result({ error: "Network request failed" }), { snapshotName: "orders" })
    );

    await waitFor(() => expect(hook.current.data?.map((o) => o._id)).toEqual(["saved-1"]));
    expect(hook.current.error).toBeNull();
    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.savedAt).toBe(1_000);
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("keeps the server's error when online", () => {
    const { result: hook } = renderHook(() => load().useOfflineOrderList(result({ error: "Not allowed" })));
    expect(hook.current.error).toBe("Not allowed");
  });

  it("reports loading, not an empty list, before the first answer", () => {
    const { result: hook } = renderHook(() => load().useOfflineOrderList(result({ isLoading: true })));
    expect(hook.current.data).toBeUndefined();
    expect(hook.current.isLoading).toBe(true);
  });
});

describe("useOfflineOrderMutation", () => {
  const ref = "orders:updateOrderStatus" as never;

  it("writes live when the order is on the server and the device is online", async () => {
    mockLive.mockResolvedValue("done");
    const { result: hook } = renderHook(() => load().useOfflineOrderMutation(ref));

    let written: unknown;
    await act(async () => {
      written = await hook.current({ orderId: "s1", status: "ready" });
    });

    expect(written).toBe("done");
    expect(mockEnqueueEdit).not.toHaveBeenCalled();
  });

  it("queues a change to a sale the server has not received", async () => {
    mockSales = [sale("local-1")];
    const { result: hook } = renderHook(() => load().useOfflineOrderMutation(ref));

    let written: unknown;
    await act(async () => {
      written = await hook.current({ orderId: "local-1", status: "preparing" });
    });

    expect(isQueuedOrderWrite(written)).toBe(true);
    expect(mockLive).not.toHaveBeenCalled();
    expect(mockEnqueueEdit).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "local-1", ref: "orders:updateOrderStatus", tenantId: "t1" })
    );
  });

  it("addresses a written Convex sale by its server id", async () => {
    mockSales = [{ ...sale("local-1"), syncedOrderId: "convex-9" }];
    mockLive.mockResolvedValue("done");
    const { result: hook } = renderHook(() => load().useOfflineOrderMutation(ref));

    await act(async () => {
      await hook.current({ orderId: "local-1", status: "ready" });
    });

    expect(mockLive).toHaveBeenCalledWith({ orderId: "convex-9", status: "ready" });
  });

  it("passes any other mutation straight through", async () => {
    mockStatus = "offline";
    mockLive.mockResolvedValue("ok");
    const { result: hook } = renderHook(() =>
      load().useOfflineOrderMutation("orders:setPrepTime" as never)
    );

    await act(async () => {
      await hook.current({ orderId: "s1", minutes: 10 });
    });

    expect(mockLive).toHaveBeenCalled();
    expect(mockEnqueueEdit).not.toHaveBeenCalled();
  });
});

describe("useOfflineOrderDetail", () => {
  it("serves a queued sale from the device with its changes and payments", () => {
    mockSales = [{ ...sale("local-1"), paidAtTender: false }];
    mockEdits = [
      {
        editId: "e1",
        tenantId: "t1",
        backend: "platform",
        orderId: "local-1",
        ref: "orders:recordPayment",
        args: { orderId: "local-1", kind: "charge", amount: 100 },
        createdAt: 6_000,
        attempts: 0,
        lastError: null,
      },
    ];
    const { result: hook } = renderHook(() => load().useOfflineOrderDetail("local-1"));

    expect(hook.current.isDeviceOnly).toBe(true);
    expect(hook.current.localOrder?.amountPaid).toBe(100);
    expect(hook.current.pendingPayments).toHaveLength(1);
  });
});
