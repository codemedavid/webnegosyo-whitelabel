import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AppState, Platform } from "react-native";
import { createDeviceCredentialStore, type DeviceEnrollment } from "../lib/loyalty/device-credential-store";
import { GlobalLoyaltySmsDelivery } from "./GlobalLoyaltySmsDelivery";
import { LoyaltySmsDeviceCard } from "./LoyaltySmsDeviceCard";

const tenantId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const otherTenant = "55555555-5555-4555-8555-555555555555";
const mockEnrollment = { deviceId: "33333333-3333-4333-8333-333333333333", credential: "A".repeat(43) };
type Scope = { tenantId: string; actorId: string };
type TestState = {
  tenantId: string; userId: string | null; loyaltyEnabled: boolean;
  isDemo: boolean; impersonatedTenantId: string | null; isOwner: boolean; isSuperadmin: boolean;
};
let mockState: TestState;
const mockRows = new Map<string, string>();
const mockSecure = {
  getItemAsync: jest.fn(async (key: string) => mockRows.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockRows.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockRows.delete(key); }),
};
const mockWorker = jest.fn<
  { runOnce: () => Promise<"idle"> },
  [Scope, DeviceEnrollment, () => boolean, () => void]
>(() => ({ runOnce: jest.fn(async () => "idle" as const) }));
const mockStorageAvailable = jest.fn(() => true);
jest.mock("../stores/auth-store", () => ({
  useAuthStore: Object.assign((selector: (state: TestState) => unknown) => selector(mockState), { getState: () => mockState }),
}));
jest.mock("../lib/loyalty/sms-delivery-flag", () => ({ isLoyaltySmsDeliveryEnabled: () => true }));
jest.mock("../lib/loyalty/sms-delivery-runtime", () => ({
  deviceCredentialStore: (scope: Scope) => jest.requireActual<typeof import("../lib/loyalty/device-credential-store")>("../lib/loyalty/device-credential-store").createDeviceCredentialStore(mockSecure, scope),
  deliveryTransportDeps: () => ({}),
  isDeviceCredentialStorageAvailable: () => mockStorageAvailable(),
  createDeliveryWorker: (...args: Parameters<typeof mockWorker>) => mockWorker(...args),
}));
jest.mock("../lib/loyalty/sms-delivery-api", () => ({
  enrollLoyaltySmsDevice: async () => ({ ok: true, device: mockEnrollment }),
  revokeLoyaltySmsDevice: async () => ({ ok: true }),
}));

const store = (tenant = tenantId) => createDeviceCredentialStore(mockSecure, { tenantId: tenant, actorId });
const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
beforeEach(() => {
  jest.useFakeTimers();
  mockRows.clear();
  mockWorker.mockClear();
  mockStorageAvailable.mockReturnValue(true);
  mockSecure.getItemAsync.mockImplementation(async (key) => mockRows.get(key) ?? null);
  mockState = { tenantId, userId: actorId, loyaltyEnabled: true, isDemo: false, impersonatedTenantId: null, isOwner: true, isSuperadmin: false };
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
});
afterEach(() => { jest.useRealTimers(); });

test("enrollment starts the mounted worker without a foreground transition", async () => {
  render(<><GlobalLoyaltySmsDelivery /><LoyaltySmsDeviceCard /></>);
  await flush();
  expect(mockWorker).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Enroll this phone"));
  await flush();
  expect(mockWorker).toHaveBeenCalledTimes(1);
  expect(mockWorker.mock.calls[0][0]).toEqual({ tenantId, actorId });
});

test("an old binary displays an upgrade instruction and does not enroll", async () => {
  mockStorageAvailable.mockReturnValue(false);
  render(<LoyaltySmsDeviceCard />);
  await flush();
  fireEvent.press(screen.getByText("Enroll this phone"));
  await flush();
  expect(screen.getByText("Update this app before enrolling this phone for SMS delivery.")).toBeTruthy();
  expect(await store().read()).toBeNull();
});

test("a scope switch cannot pair the previous credential with the next tenant", async () => {
  await store().write(mockEnrollment);
  const view = render(<GlobalLoyaltySmsDelivery />);
  await flush();
  expect(mockWorker).toHaveBeenCalledTimes(1);
  const oldCanSend = mockWorker.mock.calls[0][2];
  mockSecure.getItemAsync.mockImplementation(async (key) => key.includes(otherTenant) ? new Promise(() => {}) : mockRows.get(key) ?? null);
  mockState = { ...mockState, tenantId: otherTenant };
  view.rerender(<GlobalLoyaltySmsDelivery />);
  await flush();
  expect(mockWorker).toHaveBeenCalledTimes(1);
  expect(oldCanSend()).toBe(false);
});

test("a superseded worker stays stopped and its revocation preserves the replacement", async () => {
  await store().write(mockEnrollment);
  render(<GlobalLoyaltySmsDelivery />);
  await flush();
  const [, , oldCanSend, oldRevoked] = mockWorker.mock.calls[0];
  const replacement = { ...mockEnrollment, credential: "B".repeat(43) };
  await act(async () => { await store().write(replacement); });
  await flush();
  expect(mockWorker).toHaveBeenCalledTimes(2);
  expect(oldCanSend()).toBe(false);
  await act(async () => { oldRevoked(); });
  await flush();
  expect(await store().read()).toEqual(replacement);
  expect(mockWorker.mock.calls[1][2]()).toBe(true);
});

test("send permission reads the current session before a React render", async () => {
  await store().write(mockEnrollment);
  render(<GlobalLoyaltySmsDelivery />);
  await flush();
  const canSend = mockWorker.mock.calls[0][2];
  expect(canSend()).toBe(true);
  mockState = { ...mockState, userId: null };
  expect(canSend()).toBe(false);
});
