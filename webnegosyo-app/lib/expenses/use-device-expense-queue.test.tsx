import { act, renderHook, waitFor } from "@testing-library/react-native";

import { pendingExpenses, pendingReceipts, subscribeExpenseQueue } from "./live-expense-queue";
import type { QueuedExpense } from "./expense-queue";
import { useDeviceExpenseQueue } from "./use-expenses";

const mockSession = { tenantId: "t1" as string | null, impersonatedTenantId: null, userId: "ana" as string | null };
jest.mock("../../stores/auth-store", () => ({
  useAuthStore: (select: (state: typeof mockSession) => unknown) => select(mockSession),
}));
jest.mock("../../stores/branch-context-store", () => ({ useBranchContextStore: () => null }));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
jest.mock("../query/use-resource", () => ({ useResource: () => ({ data: undefined }), invalidateResource: jest.fn() }));
jest.mock("../query/use-screen-focus", () => ({ useRefetchOnScreenFocus: jest.fn() }));
jest.mock("../profit/use-profit", () => ({ PROFIT_RESOURCE: "profit" }));
jest.mock("./use-drawer-expenses", () => ({ SHIFT_LINKS_RESOURCE: "expense-shift-links" }));
jest.mock("./expense-client", () => ({ liveExpenseDb: {} }));
jest.mock("./expense-service", () => ({}));
jest.mock("./live-expense-queue", () => ({
  pendingExpenses: jest.fn(),
  pendingReceipts: jest.fn(async () => []),
  subscribeExpenseQueue: jest.fn(() => () => undefined),
}));

function queued(id: string): QueuedExpense {
  return {
    id,
    tenantId: "t1",
    userId: "ana",
    categoryName: "Ice (Yelo)",
    attempts: 0,
    retryAt: null,
    createdAt: 1,
    refusedReason: null,
    payload: { kind: "drawer", input: { shiftId: "s", amountCents: 100, categoryId: "c", clientRequestId: id, recordedByName: "Ana" } },
  };
}

describe("useDeviceExpenseQueue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.userId = "ana";
    jest.mocked(pendingReceipts).mockResolvedValue([]);
  });

  it("never lets an older read land over a newer one", async () => {
    // Arrange: the mount's read is slow; the read after a queue change is fast.
    let finishSlow: (entries: QueuedExpense[]) => void = () => undefined;
    jest
      .mocked(pendingExpenses)
      .mockImplementationOnce(() => new Promise((resolve) => (finishSlow = resolve)))
      .mockImplementationOnce(async () => []);
    const { result } = renderHook(() => useDeviceExpenseQueue());
    const changed = jest.mocked(subscribeExpenseQueue).mock.calls[0][0];

    // Act: the entry was sent meanwhile, so the newer read finds nothing.
    await act(async () => changed());
    await act(async () => finishSlow([queued("already-sent")]));

    // Assert
    expect(result.current.expenses).toEqual([]);
  });

  it("reads again for the person who signs in on the same phone", async () => {
    jest.mocked(pendingExpenses).mockResolvedValue([]);
    const { rerender } = renderHook(() => useDeviceExpenseQueue());
    await waitFor(() => expect(pendingExpenses).toHaveBeenCalledTimes(1));

    mockSession.userId = "ben";
    rerender({});

    await waitFor(() => expect(pendingExpenses).toHaveBeenCalledTimes(2));
  });
});
