import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { router } from "expo-router";
import PosLoyaltyScreen from "../app/(main)/pos-loyalty";
import {
  callLoyaltyPos,
  readPendingLoyaltySale,
  savePendingLoyaltySale,
  readReservedLoyaltyQuote,
  saveReservedLoyaltyQuote,
} from "../lib/loyalty/pos-api";

const mockReset = jest.fn();
const mockAuth = {
  tenantId: "tenant",
  userId: "cashier",
  isOwner: true,
  role: "admin",
  permissions: [],
  isDemo: false,
};
const mockCart = {
  saleOutlet: { id: "south", name: "South" },
  lines: [{ menuItemId: "coffee", quantity: 1, selections: [] }],
  orderTypeId: "pickup",
  discount: { vouchers: [] },
  reset: mockReset,
};
const mockNavigation = { addListener: jest.fn(() => jest.fn()) };
jest.mock("../stores/auth-store", () => ({
  useAuthStore: Object.assign(() => mockAuth, { getState: () => mockAuth }),
}));
jest.mock("../stores/pos-cart-store", () => ({
  usePosCartStore: () => mockCart,
}));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => void) =>
    jest.requireActual<typeof import("react")>("react").useEffect(callback, [callback]),
}));
jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));
jest.mock("../lib/loyalty/pos-api", () => ({
  callLoyaltyPos: jest.fn(),
  readPendingLoyaltySale: jest.fn(),
  savePendingLoyaltySale: jest.fn(),
  readReservedLoyaltyQuote: jest.fn(),
  saveReservedLoyaltyQuote: jest.fn(),
  isLoyaltyPosEnabled: () => true,
  newLoyaltyRequestId: () => "stable-id",
  LoyaltyPosApiError: class extends Error {},
}));

beforeEach(() => {
  jest.clearAllMocks();
  (readPendingLoyaltySale as jest.Mock).mockResolvedValue(null);
  (readReservedLoyaltyQuote as jest.Mock).mockResolvedValue(null);
  (saveReservedLoyaltyQuote as jest.Mock).mockResolvedValue(undefined);
  (savePendingLoyaltySale as jest.Mock).mockResolvedValue(undefined);
});

it("journals before settlement and recovers the same sale after a lost response", async () => {
  const calls = callLoyaltyPos as jest.Mock;
  calls
    .mockReset()
    .mockResolvedValueOnce({
      quote: {
        quoteId: "quote",
        expiresAt: "2026-09-14T12:00:00Z",
        totalCentavos: 5000,
        discount: { label: "Reward", amountCentavos: 5000 },
        paymentMethods: [{ id: "cash", name: "Cash", kind: "cash" }],
      },
    })
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValueOnce({
      receipt: { settlementId: "receipt", totalCentavos: 5000 },
    });
  render(<PosLoyaltyScreen />);
  await waitFor(() => expect(readPendingLoyaltySale).toHaveBeenCalled());
  fireEvent.changeText(screen.getByLabelText("Claim code"), "signed-claim");
  fireEvent.press(screen.getByText("Preview reward"));
  fireEvent.press(await screen.findByText("Complete sale"));
  fireEvent.press(await screen.findByText("Recover sale"));
  await screen.findByText("Sale completed");
  expect(calls.mock.calls[0][1].outletId).toBe("south");
  expect(calls.mock.calls[2]).toEqual(calls.mock.calls[1]);
  expect(
    (saveReservedLoyaltyQuote as jest.Mock).mock.invocationCallOrder[0],
  ).toBeLessThan(calls.mock.invocationCallOrder[0]);
  expect(
    (savePendingLoyaltySale as jest.Mock).mock.invocationCallOrder[0],
  ).toBeLessThan(calls.mock.invocationCallOrder[1]);
  expect(mockReset).toHaveBeenCalledTimes(1);
  expect(savePendingLoyaltySale).toHaveBeenLastCalledWith(
    "tenant",
    "cashier",
    null,
  );
  fireEvent.press(screen.getByText("New sale"));
  expect(router.navigate).toHaveBeenCalledWith("/(main)/pos");
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.queryByText("Sale completed")).toBeNull();
});

it("recovers a stored sale without requiring a cart or collecting another payment", async () => {
  const pending = {
    quoteId: "old-quote",
    clientOrderId: "original-id",
    tender: { methodId: "cash", amountTenderedCentavos: 10000 },
  };
  (readPendingLoyaltySale as jest.Mock).mockResolvedValue(pending);
  (callLoyaltyPos as jest.Mock)
    .mockReset()
    .mockResolvedValue({
      receipt: { settlementId: "original-receipt", totalCentavos: 5000 },
    });
  render(<PosLoyaltyScreen />);
  fireEvent.press(await screen.findByText("Recover sale"));
  await screen.findByText("Sale completed");
  expect(callLoyaltyPos).toHaveBeenCalledWith("settlements", {
    tenantId: "tenant",
    ...pending,
  });
  expect(screen.queryByLabelText("Claim code")).toBeNull();
});

it("recovers an interrupted preview by cancelling its stored reservation before leaving", async () => {
  (readReservedLoyaltyQuote as jest.Mock).mockResolvedValue("old-preview");
  (callLoyaltyPos as jest.Mock)
    .mockReset()
    .mockResolvedValue({ released: true });
  render(<PosLoyaltyScreen />);
  await screen.findByText(/A reward preview needs confirmation/);
  fireEvent.press(screen.getByText("Cancel redemption"));
  await waitFor(() =>
    expect(callLoyaltyPos).toHaveBeenCalledWith(
      "quotes",
      { tenantId: "tenant", quoteId: "old-preview" },
      "DELETE",
    ),
  );
  await waitFor(() =>
    expect(saveReservedLoyaltyQuote).toHaveBeenCalledWith(
      "tenant",
      "cashier",
      null,
    ),
  );
  expect(router.navigate).toHaveBeenCalledWith("/(main)/pos-tender");
});
