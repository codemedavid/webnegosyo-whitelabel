import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { RemitInboxStrip } from "./RemitInboxStrip";

let mockSession = { tenantId: "t1", impersonatedTenantId: null, userId: "maria", role: "admin", isOwner: false, permissions: ["cash_manage"] as string[] | null, isDemo: false };
let mockRemits: unknown[] = [];
let mockOpen: unknown[] = [];

jest.mock("../../stores/auth-store", () => ({ useAuthStore: (select: (s: unknown) => unknown) => select(mockSession) }));
jest.mock("../../lib/offline/use-connectivity", () => ({ useConnectivity: () => ({ status: "online", changedAt: 0 }) }));
jest.mock("../../lib/business-day/use-trading-day", () => ({ useTradingDay: () => ({ schedule: [], todayKey: "2026-10-24" }) }));
jest.mock("../../lib/cash/use-cash-rules", () => ({ liveCashDb: {}, useCashSettings: () => ({ data: undefined }) }));
let mockDay: { dayKey: string; status: unknown } = { dayKey: "2026-10-23", status: null };
jest.mock("../../stores/branch-context-store", () => ({ useBranchContextStore: (select: (s: unknown) => unknown) => select({ selectedOutletId: null }) }));
jest.mock("../../lib/cash/use-day-close", () => ({ useDayToClose: () => mockDay }));
jest.mock("../../lib/cash/use-remittances", () => ({
  useRemittances: () => ({ data: mockRemits }),
  useOpenShifts: () => ({ data: mockOpen }),
  useRemittanceRefresh: () => async () => undefined,
}));

const pending = (id: string, cents: number) => ({ id, kind: "shift", status: "pending", handedOverCents: cents, createdAt: "2026-10-27T01:00:00.000Z" });

beforeEach(() => {
  mockSession = { ...mockSession, permissions: ["cash_manage"], isDemo: false };
  mockRemits = [];
  mockOpen = [];
  mockDay = { dayKey: "2026-10-23", status: null };
});

describe("RemitInboxStrip", () => {
  it("draws nothing when nothing waits", () => {
    render(<RemitInboxStrip onOpenRemittances={jest.fn()} onOpenDayClose={jest.fn()} />);
    expect(screen.toJSON()).toBeNull();
  });

  it("draws nothing for someone who cannot receive cash", () => {
    mockSession = { ...mockSession, permissions: ["pos"] };
    mockRemits = [pending("r1", 634500)];
    render(<RemitInboxStrip onOpenRemittances={jest.fn()} onOpenDayClose={jest.fn()} />);
    expect(screen.toJSON()).toBeNull();
  });

  it("says how many remits wait and opens the inbox", () => {
    mockRemits = [pending("r1", 634500), pending("r2", 838000)];
    const onOpen = jest.fn();
    render(<RemitInboxStrip onOpenRemittances={onOpen} onOpenDayClose={jest.fn()} />);
    expect(screen.getByText("2 remits to accept · ₱14,725")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Review: 2 remits to accept · ₱14,725" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("names a shift left open long after the day ended, with End it", () => {
    mockOpen = [{ id: "s2", staffName: "Ben Cruz", staffUserId: "ben", drawerName: "Cashier 2", openedAt: "2026-01-01T02:00:00.000Z" }];
    render(<RemitInboxStrip onOpenRemittances={jest.fn()} onOpenDayClose={jest.fn()} />);
    expect(screen.getByText(/Ben's shift on Cashier 2 is still open/)).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: /End it/ }));
    expect(screen.getByText("End Ben's shift?")).toBeTruthy();
  });

  it("says yesterday is ready to close and opens it", () => {
    mockDay = {
      dayKey: "2026-10-23",
      status: {
        businessDay: "2026-10-23",
        openShifts: [],
        existingClose: null,
        preview: { shifts: [{ shiftId: "s1" }], cashToAccountForCents: 884500 },
      },
    };
    const onOpenDayClose = jest.fn();
    render(<RemitInboxStrip onOpenRemittances={jest.fn()} onOpenDayClose={onOpenDayClose} />);
    expect(screen.getByText("Friday is ready to close")).toBeTruthy();
    expect(screen.getByText("1 shift ended · ₱8,845 to deposit")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Close: Friday is ready to close" }));
    expect(onOpenDayClose).toHaveBeenCalledWith("2026-10-23", null);
  });
});
