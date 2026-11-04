// The Remittances inbox's states (06 §6): closed to a cashier, loading, a
// failed read, empty ("All remittances are in"), offline (Accept disabled),
// demo, and the three tabs.
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import RemittancesScreen from "../../app/(main)/remittances";

const mockOwner = {
  tenantId: "t1",
  impersonatedTenantId: null,
  userId: "maria",
  role: "admin",
  isOwner: false,
  permissions: ["cash_manage"] as string[] | null,
  isDemo: false,
  outletName: "Main branch",
};
let mockSession = mockOwner;
let mockConnectivity = "online";
const mockRow = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  tenantId: "t1",
  outletId: null,
  kind: "shift",
  shiftId: "s1",
  movementId: null,
  businessDay: "2026-10-24",
  cashierUserId: "ana",
  cashierName: "Ana Reyes",
  handedOverCents: 634500,
  remittedTo: null,
  remittedToName: "Maria Santos",
  toSafe: false,
  status: "pending",
  receivedCents: null,
  receivedByName: null,
  receivedAt: null,
  acceptMethod: null,
  isSelfReceived: false,
  receiverNote: null,
  disputeReason: null,
  resolvedByName: null,
  resolvedAt: null,
  resolutionNote: null,
  createdAt: "2026-10-24T18:51:00.000Z",
  shift: { drawerName: "Cashier 1", openedAt: null, closedAt: null, countedCents: 834500, expectedCents: 846500, varianceReason: null },
  ...patch,
});
let mockQuery: { data: unknown; isLoading: boolean; error: string | null } = { data: [], isLoading: false, error: null };

jest.mock("../../stores/auth-store", () => ({ useAuthStore: (select: (s: unknown) => unknown) => select(mockSession) }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../lib/offline/use-connectivity", () => ({ useConnectivity: () => ({ status: mockConnectivity, changedAt: 0 }) }));
jest.mock("../../lib/cash/use-cash-rules", () => ({ liveCashDb: {} }));
jest.mock("../../lib/business-day/use-trading-day", () => ({ useTradingDay: () => ({ schedule: [], todayKey: "2026-10-24" }) }));
jest.mock("../../lib/cash/use-day-close", () => ({ useDayToClose: () => ({ dayKey: "2026-10-23", status: null }) }));
jest.mock("../../stores/branch-context-store", () => ({ useBranchContextStore: (select: (s: unknown) => unknown) => select({ selectedOutletId: null }) }));
jest.mock("../../lib/cash/use-remittances", () => ({
  useRemittances: () => ({ ...mockQuery, refetch: async () => undefined, isRefetching: false, dataUpdatedAt: 0 }),
  useRemittanceRefresh: () => async () => undefined,
}));

beforeEach(() => {
  mockSession = mockOwner;
  mockConnectivity = "online";
  mockQuery = { data: [], isLoading: false, error: null };
});

describe("Remittances screen", () => {
  it("is closed to a cashier", () => {
    mockSession = { ...mockOwner, permissions: ["pos"] };
    render(<RemittancesScreen />);
    expect(screen.getByText("For cash managers")).toBeTruthy();
  });

  it("waits, then says plainly when the read failed", () => {
    mockQuery = { data: undefined, isLoading: true, error: null };
    const { unmount } = render(<RemittancesScreen />);
    expect(screen.getByText("Loading remittances...")).toBeTruthy();
    unmount();
    mockQuery = { data: undefined, isLoading: false, error: "boom" };
    render(<RemittancesScreen />);
    expect(screen.getByText("Couldn't load remittances")).toBeTruthy();
  });

  it("is calm when everything is in", () => {
    render(<RemittancesScreen />);
    expect(screen.getByText("All remittances are in")).toBeTruthy();
  });

  it("lists what waits with a result pill and Accept, and splits the tabs", () => {
    mockQuery = {
      data: [mockRow("r1"), mockRow("r2", { status: "accepted", receivedCents: 634500, receivedByName: "Maria" }), mockRow("p1", { kind: "pickup", handedOverCents: 250000 })],
      isLoading: false,
      error: null,
    };
    render(<RemittancesScreen />);
    expect(screen.getByText("To accept (1)")).toBeTruthy();
    expect(screen.getByText("Short ₱120")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept ₱6,345 from Ana Reyes" })).toBeTruthy();
    fireEvent.press(screen.getByText("Pickups"));
    expect(screen.getByText("Pickup")).toBeTruthy();
    fireEvent.press(screen.getByText("Accepted"));
    expect(screen.getByText(/Accepted by Maria/)).toBeTruthy();
  });

  it("offers the day close for the day to close, and each cashier's over/short", () => {
    mockQuery = { data: [mockRow("r1")], isLoading: false, error: null };
    render(<RemittancesScreen />);
    expect(screen.getByText("Close Friday")).toBeTruthy();
    expect(screen.getByText("Day closes")).toBeTruthy();
    fireEvent.press(screen.getByText("Cashiers"));
    expect(screen.getAllByText(/Ana Reyes/).length).toBeGreaterThan(0);
  });

  it("never offers the cashier their own cash", () => {
    mockSession = { ...mockOwner, userId: "ana" };
    mockQuery = { data: [mockRow("r1")], isLoading: false, error: null };
    render(<RemittancesScreen />);
    expect(screen.queryByRole("button", { name: /Accept ₱6,345/ })).toBeNull();
  });

  it("offline, Accept is disabled and the screen says why", () => {
    mockConnectivity = "offline";
    mockQuery = { data: [mockRow("r1")], isLoading: false, error: null };
    render(<RemittancesScreen />);
    expect(screen.getByText(/Accepting needs a connection/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept ₱6,345 from Ana Reyes" }).props.accessibilityState.disabled).toBe(true);
  });

  it("demo reads nothing and changes nothing", () => {
    mockSession = { ...mockOwner, isDemo: true };
    mockQuery = { data: [mockRow("r1")], isLoading: false, error: null };
    render(<RemittancesScreen />);
    expect(screen.getByText(/exploring the demo store/)).toBeTruthy();
    expect(screen.getByText("All remittances are in")).toBeTruthy();
  });
});
