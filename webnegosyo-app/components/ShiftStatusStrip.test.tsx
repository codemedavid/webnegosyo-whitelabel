import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { ShiftStatusStrip } from "./ShiftStatusStrip";
import { loadOpenShift } from "../lib/shift-service";

const mockSession = { tenantId: "tenant", userId: "cashier", isDemo: false };

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: React.EffectCallback) => {
    const { useEffect } = jest.requireActual<typeof React>("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("../stores/auth-store", () => ({
  useAuthStore: Object.assign(
    (select: (state: typeof mockSession) => unknown) => select(mockSession),
    { getState: () => mockSession },
  ),
}));
jest.mock("../lib/shift-service", () => ({ loadOpenShift: jest.fn() }));

const openShiftRow = {
  id: "shift",
  outletId: null,
  staffUserId: "cashier",
  staffName: "Cashier",
  status: "open" as const,
  openingFloat: 100,
  openedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
  closedAt: null,
  closingCount: null,
  expectedCash: null,
  note: null,
};

beforeEach(() => jest.clearAllMocks());

it("reports an open drawer and how long it has run", async () => {
  jest.mocked(loadOpenShift).mockResolvedValue(openShiftRow);

  const screen = render(<ShiftStatusStrip onPress={() => {}} />);

  await waitFor(() => expect(screen.getByText("On shift")).toBeTruthy());
  expect(screen.getByText(/3h/)).toBeTruthy();
});

it("offers the drawer when no shift is running", async () => {
  jest.mocked(loadOpenShift).mockResolvedValue(null);
  const onPress = jest.fn();

  const screen = render(<ShiftStatusStrip onPress={onPress} />);

  await waitFor(() => expect(screen.getByText("Not clocked in")).toBeTruthy());
  fireEvent.press(screen.getByText("Not clocked in"));
  expect(onPress).toHaveBeenCalled();
});

it("draws nothing until the first read lands", () => {
  // A strip that says "Not clocked in" for a beat to someone mid-shift is a
  // lie about the money in their hands.
  jest.mocked(loadOpenShift).mockReturnValue(new Promise(() => {}));

  const screen = render(<ShiftStatusStrip onPress={() => {}} />);

  expect(screen.queryByText("Not clocked in")).toBeNull();
  expect(screen.queryByText("On shift")).toBeNull();
});
