import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform, Switch } from "react-native";
import { createDeviceCredentialStore } from "../lib/loyalty/device-credential-store";
import { LoyaltySmsDeviceCard } from "./LoyaltySmsDeviceCard";

const tenantId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const mockEnrollment = { deviceId: "33333333-3333-4333-8333-333333333333", credential: "A".repeat(43) };
type TestState = { tenantId: string; userId: string | null; isDemo: boolean; isOwner: boolean; isSuperadmin: boolean };
let mockState: TestState;
const mockRows = new Map<string, string>();
const mockSecure = {
  getItemAsync: jest.fn(async (key: string) => mockRows.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockRows.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockRows.delete(key); }),
};
const mockStorageAvailable = jest.fn(() => true);
let mockGatewayEnabled = false;
const mockNative = {
  startSmsGateway: jest.fn(async () => { mockGatewayEnabled = true; }),
  stopSmsGateway: jest.fn(async () => { mockGatewayEnabled = false; }),
  getSmsGatewayState: jest.fn(async () => ({ enabled: mockGatewayEnabled, running: mockGatewayEnabled })),
  setSmsGatewayStatus: jest.fn(),
  isIgnoringBatteryOptimizations: jest.fn(async () => true),
  requestIgnoreBatteryOptimizations: jest.fn(async () => undefined),
};
let mockHasNative = true;
const mockSmsPermission = { check: jest.fn(async () => true), request: jest.fn(async () => "granted") };
const mockRevoke = jest.fn(async () => ({ ok: true }));

jest.mock("../stores/auth-store", () => ({
  useAuthStore: Object.assign((selector: (state: TestState) => unknown) => selector(mockState), { getState: () => mockState }),
}));
jest.mock("../lib/loyalty/sms-delivery-flag", () => ({ isLoyaltySmsDeliveryEnabled: () => true }));
jest.mock("../lib/loyalty/sms-delivery-runtime", () => ({
  deviceCredentialStore: (scope: { tenantId: string; actorId: string }) =>
    jest.requireActual<typeof import("../lib/loyalty/device-credential-store")>("../lib/loyalty/device-credential-store")
      .createDeviceCredentialStore(mockSecure, scope),
  deliveryTransportDeps: () => ({}),
  isDeviceCredentialStorageAvailable: () => mockStorageAvailable(),
  smsGatewayNative: () => (mockHasNative ? mockNative : null),
}));
jest.mock("../lib/loyalty/sms-delivery-api", () => ({
  enrollLoyaltySmsDevice: async () => ({ ok: true, device: mockEnrollment }),
  revokeLoyaltySmsDevice: (...args: unknown[]) => mockRevoke(...(args as [])),
}));
// A getter: the component import is hoisted above this file's consts.
jest.mock("../lib/sms/android-permissions", () => ({ get androidSmsPermissions() { return mockSmsPermission; } }));
jest.mock("../lib/loyalty/notification-permission", () => ({ requestGatewayNotificationPermission: async () => true }));
jest.mock("./loyalty/SmsFallbackCard", () => ({ SmsFallbackCard: () => null }));

// The composite Switch: its host (AndroidSwitch) carries `on`, not `value`.
const gatewaySwitch = () => screen.UNSAFE_getByType(Switch);
const store = () => createDeviceCredentialStore(mockSecure, { tenantId, actorId });
const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };

beforeEach(() => {
  mockRows.clear();
  mockGatewayEnabled = false;
  mockHasNative = true;
  mockStorageAvailable.mockReturnValue(true);
  mockSmsPermission.check.mockResolvedValue(true);
  mockSmsPermission.request.mockResolvedValue("granted");
  mockNative.isIgnoringBatteryOptimizations.mockResolvedValue(true);
  jest.clearAllMocks();
  mockState = { tenantId, userId: actorId, isDemo: false, isOwner: true, isSuperadmin: false };
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
});

test("enrolling shows the gateway switch, off by default", async () => {
  render(<LoyaltySmsDeviceCard />);
  await flush();
  fireEvent.press(screen.getByText("Enroll this phone"));
  await flush();
  expect(await store().read()).toEqual(mockEnrollment);
  expect(gatewaySwitch().props.value).toBe(false);
  expect(mockNative.startSmsGateway).not.toHaveBeenCalled();
});

test("switching on starts the background gateway for this store and account", async () => {
  await store().write(mockEnrollment);
  render(<LoyaltySmsDeviceCard />);
  await flush();
  fireEvent(gatewaySwitch(), "valueChange", true);
  await flush();
  expect(mockNative.startSmsGateway).toHaveBeenCalledWith({ tenantId, actorId });
  expect(gatewaySwitch().props.value).toBe(true);
  expect(screen.getByText(/even with the app closed/i)).toBeTruthy();
});

test("a refused SMS permission explains itself and never starts the service", async () => {
  await store().write(mockEnrollment);
  mockSmsPermission.check.mockResolvedValue(false);
  mockSmsPermission.request.mockResolvedValue("denied");
  render(<LoyaltySmsDeviceCard />);
  await flush();
  fireEvent(gatewaySwitch(), "valueChange", true);
  await flush();
  expect(mockNative.startSmsGateway).not.toHaveBeenCalled();
  expect(screen.getByText(/allow sms/i)).toBeTruthy();
});

test("switching off stops the gateway", async () => {
  await store().write(mockEnrollment);
  mockGatewayEnabled = true;
  render(<LoyaltySmsDeviceCard />);
  await flush();
  fireEvent(gatewaySwitch(), "valueChange", false);
  await flush();
  expect(mockNative.stopSmsGateway).toHaveBeenCalled();
  expect(gatewaySwitch().props.value).toBe(false);
});

test("battery restrictions are flagged with a one-tap fix while the gateway is on", async () => {
  await store().write(mockEnrollment);
  mockGatewayEnabled = true;
  mockNative.isIgnoringBatteryOptimizations.mockResolvedValue(false);
  render(<LoyaltySmsDeviceCard />);
  await flush();
  fireEvent.press(screen.getByText("Allow background activity"));
  await flush();
  expect(mockNative.requestIgnoreBatteryOptimizations).toHaveBeenCalled();
});

test("removing the phone stops the gateway before revoking it", async () => {
  await store().write(mockEnrollment);
  mockGatewayEnabled = true;
  render(<LoyaltySmsDeviceCard />);
  await flush();
  fireEvent.press(screen.getByText("Remove this phone"));
  await flush();
  expect(mockNative.stopSmsGateway).toHaveBeenCalled();
  expect(mockNative.stopSmsGateway.mock.invocationCallOrder[0]).toBeLessThan(mockRevoke.mock.invocationCallOrder[0]);
  expect(await store().read()).toBeNull();
});

test("an APK without the gateway service is asked to update, with no switch", async () => {
  await store().write(mockEnrollment);
  mockHasNative = false;
  render(<LoyaltySmsDeviceCard />);
  await flush();
  expect(screen.UNSAFE_queryByType(Switch)).toBeNull();
  expect(screen.getByText(/update the app/i)).toBeTruthy();
});

test("an old binary without secure storage displays an upgrade instruction and does not enroll", async () => {
  mockStorageAvailable.mockReturnValue(false);
  render(<LoyaltySmsDeviceCard />);
  await flush();
  fireEvent.press(screen.getByText("Enroll this phone"));
  await flush();
  expect(screen.getByText("Update this app before enrolling this phone for SMS delivery.")).toBeTruthy();
  expect(await store().read()).toBeNull();
});
