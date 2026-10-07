import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Switch } from "react-native";
import { WalletVerificationCard } from "./WalletVerificationCard";

const tenantId = "11111111-1111-4111-8111-111111111111";
type Settings = {
  gatewayOnline: boolean;
  lastSeenAt: string | null;
  fallback: { configured: boolean; senderName: string | null };
  walletVerification: boolean;
};
let mockSettings: Settings;
const mockRead = jest.fn(async () => ({ ok: true as const, settings: mockSettings }));
const mockSet = jest.fn<Promise<{ ok: true; walletVerification: boolean } | { ok: false; error: string }>, unknown[]>(
  async (...args: unknown[]) => ({ ok: true, walletVerification: args[2] as boolean }),
);

let mockState = { tenantId: tenantId as string | null, isDemo: false };
let mockFlag = true;
jest.mock("../../stores/auth-store", () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select(mockState),
}));
jest.mock("../../lib/loyalty/sms-delivery-flag", () => ({ isLoyaltySmsDeliveryEnabled: () => mockFlag }));
jest.mock("../../lib/loyalty/sms-delivery-runtime", () => ({ deliveryTransportDeps: () => ({}) }));
jest.mock("../../lib/loyalty/sms-delivery-api", () => ({
  readLoyaltySmsSettings: () => mockRead(),
  setLoyaltyWalletVerification: (...args: unknown[]) => mockSet(...args),
}));

const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  mockState = { tenantId, isDemo: false };
  mockFlag = true;
  mockSettings = { gatewayOnline: true, lastSeenAt: null, fallback: { configured: false, senderName: null }, walletVerification: false };
});

test("shows the store's current choice and turns it on", async () => {
  render(<WalletVerificationCard />);
  await flush();
  const toggle = screen.UNSAFE_getByType(Switch);
  expect(toggle.props.value).toBe(false);
  fireEvent(toggle, "valueChange", true);
  await flush();
  expect(mockSet).toHaveBeenCalledWith({}, tenantId, true);
  expect(screen.UNSAFE_getByType(Switch).props.value).toBe(true);
});

test("keeps the old value and says why when the save is refused", async () => {
  mockSet.mockResolvedValueOnce({ ok: false, error: "Forbidden" });
  render(<WalletVerificationCard />);
  await flush();
  fireEvent(screen.UNSAFE_getByType(Switch), "valueChange", true);
  await flush();
  expect(screen.UNSAFE_getByType(Switch).props.value).toBe(false);
  expect(screen.getByText("Forbidden")).toBeTruthy();
});

test("warns that nobody can see rewards when it is on and no code can be sent", async () => {
  mockSettings = { ...mockSettings, gatewayOnline: false, walletVerification: true };
  render(<WalletVerificationCard />);
  await flush();
  expect(screen.getByText(/customers can’t get a code right now/i)).toBeTruthy();
});

test("stays disabled until the current setting is known", async () => {
  mockRead.mockResolvedValueOnce({ ok: false, error: "Loyalty SMS delivery is not available yet." } as never);
  render(<WalletVerificationCard />);
  await flush();
  expect(screen.UNSAFE_getByType(Switch).props.disabled).toBe(true);
  expect(screen.getByText("Loyalty SMS delivery is not available yet.")).toBeTruthy();
});

test("renders nothing while the SMS pilot is off, in demo mode, or signed out", async () => {
  for (const setup of [() => { mockFlag = false; }, () => { mockState = { tenantId, isDemo: true }; }, () => { mockState = { tenantId: null, isDemo: false }; }]) {
    mockFlag = true;
    mockState = { tenantId, isDemo: false };
    setup();
    const view = render(<WalletVerificationCard />);
    await flush();
    expect(view.toJSON()).toBeNull();
    view.unmount();
  }
  expect(mockRead).not.toHaveBeenCalled();
});
