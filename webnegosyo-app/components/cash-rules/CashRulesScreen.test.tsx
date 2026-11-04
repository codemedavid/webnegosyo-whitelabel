// The Shift & remit rules screen's states (06 §6 "Rules" row): hidden from a
// cashier and a branch-locked account, loading, a failed read, demo read-only
// on the defaults, offline (nothing can be saved), and the cash manager who
// may change the rules but not the business day.
import React from "react";
import { render, screen } from "@testing-library/react-native";

import { DEFAULT_CASH_SETTINGS } from "../../lib/cash/settings";
import CashRulesScreen from "../../app/(main)/cash-rules";

interface Session {
  tenantId: string | null;
  tenantName: string | null;
  role: string | null;
  isOwner: boolean;
  permissions: string[] | null;
  outletId: string | null;
  isDemo: boolean;
  orderBackend: string | null;
  impersonatedTenantId: string | null;
}

const mockOwner: Session = {
  tenantId: "t1",
  tenantName: "Loly's Café",
  role: "admin",
  isOwner: true,
  permissions: null,
  outletId: null,
  isDemo: false,
  orderBackend: "platform",
  impersonatedTenantId: null,
};

let mockSession: Session = mockOwner;
let mockSettingsResult: { data: unknown; isLoading: boolean; error: string | null } = {
  data: DEFAULT_CASH_SETTINGS,
  isLoading: false,
  error: null,
};
let mockConnectivity = "online";

const mockIdle = { data: undefined, isLoading: false, error: null, refetch: async () => undefined, isRefetching: false, dataUpdatedAt: 0 };

jest.mock("../../stores/auth-store", () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select(mockSession),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../lib/use-outlets", () => ({ useOutlets: () => ({ outlets: [], isLoading: false, error: null }) }));
jest.mock("../../lib/manage-staff-client", () => ({ useManageStaff: () => jest.fn() }));
jest.mock("../../lib/offline/use-connectivity", () => ({ useConnectivity: () => ({ status: mockConnectivity, changedAt: 0 }) }));
jest.mock("../../lib/query/use-resource", () => ({ useResource: () => mockIdle }));
jest.mock("../../lib/business-day/use-trading-day", () => ({
  useTradingDay: () => ({
    schedule: [],
    isFallback: false,
    isLoading: false,
    todayKey: "2026-10-27",
    anchorMs: 0,
    startMs: 0,
    endMs: 0,
  }),
}));
jest.mock("../../lib/business-day/backend-sync", () => ({ pushCutoffToOrderBackend: async () => true }));
jest.mock("../../lib/cash/use-cash-rules", () => ({
  liveCashDb: {},
  useCashSettings: () => ({ ...mockIdle, ...mockSettingsResult }),
  useServicePeriods: () => ({ ...mockIdle, data: [] }),
  useOrderHours: () => mockIdle,
  useCashRulesRefresh: () => ({ settings: jest.fn(), servicePeriods: jest.fn(), cutoffSchedule: jest.fn() }),
}));

beforeEach(() => {
  mockSession = mockOwner;
  mockSettingsResult = { data: DEFAULT_CASH_SETTINGS, isLoading: false, error: null };
  mockConnectivity = "online";
});

describe("Shift & remit rules screen", () => {
  it("shows every section to the owner", () => {
    render(<CashRulesScreen />);
    for (const heading of ["Business day ends at", "Counting", "Short & over", "Remittances", "Selling", "Shifts", "Who can receive cash"]) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
    expect(screen.getByRole("radio", { name: "4 AM" }).props.accessibilityState.disabled).toBe(false);
  });

  it("is closed to a cashier", () => {
    mockSession = { ...mockOwner, isOwner: false, permissions: ["pos"] };
    render(<CashRulesScreen />);
    expect(screen.getByText("For the owner and cash managers")).toBeTruthy();
    expect(screen.queryByText("Business day ends at")).toBeNull();
  });

  it("is closed to a branch-locked cash manager (the rules are store-wide)", () => {
    mockSession = { ...mockOwner, isOwner: false, permissions: ["cash_manage"], outletId: "b1" };
    render(<CashRulesScreen />);
    expect(screen.getByText("For the owner and cash managers")).toBeTruthy();
  });

  it("waits for the rules before drawing them", () => {
    mockSettingsResult = { data: undefined, isLoading: true, error: null };
    render(<CashRulesScreen />);
    expect(screen.getByText("Loading rules...")).toBeTruthy();
  });

  it("says so when the rules could not be read, never showing the defaults as if stored", () => {
    mockSettingsResult = { data: undefined, isLoading: false, error: "Shift & remit rules need a server update first." };
    render(<CashRulesScreen />);
    expect(screen.getByText("Couldn't load the rules")).toBeTruthy();
    expect(screen.queryByText("Counting")).toBeNull();
  });

  it("demo reads the defaults and changes nothing", () => {
    mockSession = { ...mockOwner, isDemo: true };
    render(<CashRulesScreen />);
    expect(screen.getAllByText(/exploring the demo store/).length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: "4 AM" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText("Blind count").props.disabled).toBe(true);
  });

  it("offline locks every control and says why", () => {
    mockConnectivity = "offline";
    render(<CashRulesScreen />);
    expect(screen.getByText("You're offline. Connect to change it.")).toBeTruthy();
    expect(screen.getByLabelText("Blind count").props.disabled).toBe(true);
  });

  it("a cash manager changes the cash rules but not the business day", () => {
    mockSession = { ...mockOwner, isOwner: false, permissions: ["cash_manage"] };
    render(<CashRulesScreen />);
    expect(screen.getByText("Only the owner or someone with Settings can change when the business day ends.")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "4 AM" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText("Blind count").props.disabled).toBe(false);
  });
});
