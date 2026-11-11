// The day close screen (06 §4.5, §6): closed to cashiers, the history without
// a day, an open shift blocks the close, a clean day closes in one tap,
// skipped items go through "Close anyway" with what was skipped in the note,
// a closed day offers deposit / print / reopen (reopen for the owner only).
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import DayCloseScreen from "../../app/(main)/day-close";
import { parseDayCloseRecord, parseDayCloseStatus } from "../../lib/cash/day-close";
import { SNAPSHOT } from "../../lib/cash/day-close.fixture";

const mockOwner = {
  tenantId: "t1",
  impersonatedTenantId: null,
  tenantName: "Loly's Café",
  role: "admin",
  isOwner: true,
  isSuperadmin: false,
  permissions: null as string[] | null,
  outletId: null as string | null,
  isDemo: false,
};
let mockSession = mockOwner;
let mockParams: Record<string, string> = { day: "2026-10-23" };
let mockStatus: unknown = undefined;
let mockCloses: unknown[] = [];
const mockRpc = jest.fn<Promise<{ data: unknown; error: null }>, [string, unknown]>(async () => ({ data: { id: "c1", version: 1 }, error: null }));
const mockPush = jest.fn();

jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() }, useLocalSearchParams: () => mockParams }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../stores/auth-store", () => ({ useAuthStore: (select: (s: unknown) => unknown) => select(mockSession) }));
jest.mock("../../stores/branch-context-store", () => ({
  useBranchContextStore: (select: (s: unknown) => unknown) => select({ selectedOutletId: null, selectedOutletName: null }),
}));
jest.mock("../../lib/offline/use-connectivity", () => ({ useConnectivity: () => ({ status: "online", changedAt: 0 }) }));
jest.mock("../../lib/business-day/use-trading-day", () => ({ useTradingDay: () => ({ schedule: [], todayKey: "2026-10-24" }) }));
jest.mock("../../lib/cash/use-cash-rules", () => ({
  liveCashDb: { from: jest.fn(), rpc: (fn: string, args: unknown) => mockRpc(fn, args) },
  useCashSettings: () => ({ data: undefined }),
}));
jest.mock("../../lib/cash/use-day-close", () => ({
  useDayCloseStatus: () => ({ data: mockStatus, isLoading: false, error: null, refetch: jest.fn(), isRefetching: false }),
  useDayCloses: () => ({ data: mockCloses, isLoading: false, error: null, refetch: jest.fn() }),
  useDayCloseRefresh: () => async () => undefined,
}));
jest.mock("../../lib/cash-slips/slip-print", () => ({ printDayCloseSlip: jest.fn(async () => ({ ok: true })), shareDayCloseSlip: jest.fn() }));
jest.mock("../../lib/cash/deposit-photo", () => ({ pickAndUploadDepositPhoto: jest.fn(async () => null) }));

const status = (patch: Record<string, unknown> = {}) =>
  parseDayCloseStatus({
    businessDay: "2026-10-23",
    window: { start: "2026-10-22T20:00:00.000Z", end: "2026-10-23T20:00:00.000Z" },
    cutoffMinutes: 240,
    openShifts: [],
    pendingRemittances: [],
    nonCashUnchecked: [],
    existingClose: null,
    preview: SNAPSHOT,
    ...patch,
  });

beforeEach(() => {
  mockSession = mockOwner;
  mockParams = { day: "2026-10-23" };
  mockStatus = status();
  mockCloses = [];
  mockRpc.mockClear();
  mockPush.mockClear();
});

describe("Day close screen", () => {
  it("is closed to a cashier", () => {
    mockSession = { ...mockOwner, isOwner: false, permissions: ["pos"] };
    render(<DayCloseScreen />);
    expect(screen.getByText("For cash managers")).toBeTruthy();
  });

  it("without a day, lists past closes and offers today's", () => {
    mockParams = {};
    mockCloses = [
      parseDayCloseRecord({ id: "c1", business_day: "2026-10-22", status: "closed", snapshot: SNAPSHOT, closed_by_name: "Lorna", closed_at: "x" }),
    ];
    render(<DayCloseScreen />);
    expect(screen.getByText("Close Saturday")).toBeTruthy();
    expect(screen.getByText("Thursday, Oct 22")).toBeTruthy();
  });

  it("shows cash to deposit and closes a clean day in one tap", async () => {
    render(<DayCloseScreen />);
    expect(screen.getByText("Cash to deposit")).toBeTruthy();
    expect(screen.getByText("₱8,845")).toBeTruthy();
    expect(screen.getByText("Ana counted twice: ₱0 → ₱8,345")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Close Friday" })));
    expect(mockRpc).toHaveBeenCalledWith("close_business_day", { p_tenant: "t1", p_outlet: null, p_day: "2026-10-23", p_note: null, p_force: false });
  });

  it("an open shift blocks the close and offers to end it", () => {
    mockStatus = status({ openShifts: [{ shiftId: "s3", staffName: "Carlo", drawerName: "Bar", openedAt: "2026-10-23T10:00:00.000Z", overdue: true }] });
    render(<DayCloseScreen />);
    expect(screen.getByText("Carlo is still on Bar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close Friday" }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByRole("button", { name: /End their shift/ }));
    expect(screen.getByText("End Carlo's shift?")).toBeTruthy();
  });

  it("closing over a waiting remittance asks first and writes what was skipped into the note", async () => {
    mockStatus = status({ pendingRemittances: [{ id: "r2", cashierName: "Ben", handedOverCents: null, status: "pending" }] });
    render(<DayCloseScreen />);
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Close Friday" })));
    expect(mockRpc).not.toHaveBeenCalled();
    expect(screen.getByText("Not done: 1 remittance not settled")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Why close now"), "Maria accepts tomorrow");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Close Friday anyway" })));
    expect(mockRpc).toHaveBeenCalledWith(
      "close_business_day",
      expect.objectContaining({ p_note: "Maria accepts tomorrow · Closed with: 1 remittance not settled", p_force: false }),
    );
  });

  it("a closed day offers the deposit, print and (for the owner) reopen", () => {
    mockStatus = status({ existingClose: { id: "c1", version: 1, status: "closed", closedAt: "x", closedByName: "Lorna" } });
    mockCloses = [parseDayCloseRecord({ id: "c1", business_day: "2026-10-23", status: "closed", snapshot: SNAPSHOT, closed_by_name: "Lorna", closed_at: "x" })];
    const { unmount } = render(<DayCloseScreen />);
    expect(screen.getByText("Closed by Lorna")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record the deposit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print day close" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reopen this day" })).toBeTruthy();
    unmount();
    mockSession = { ...mockOwner, isOwner: false, permissions: ["cash_manage"] };
    render(<DayCloseScreen />);
    expect(screen.queryByRole("button", { name: "Reopen this day" })).toBeNull();
  });
});
