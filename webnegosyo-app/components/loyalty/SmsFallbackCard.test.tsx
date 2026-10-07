import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SmsFallbackCard } from "./SmsFallbackCard";

const tenantId = "11111111-1111-4111-8111-111111111111";
const KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
type Settings = { gatewayOnline: boolean; lastSeenAt: string | null; fallback: { configured: boolean; senderName: string | null } };
let mockSettings: Settings;
const mockRead = jest.fn(async () => ({ ok: true as const, settings: mockSettings }));
const mockSave = jest.fn<Promise<{ ok: true } | { ok: false; error: string }>, unknown[]>(async () => ({ ok: true }));
const mockClear = jest.fn<Promise<{ ok: true }>, unknown[]>(async () => ({ ok: true }));

jest.mock("../../lib/loyalty/sms-delivery-runtime", () => ({ deliveryTransportDeps: () => ({}) }));
jest.mock("../../lib/loyalty/sms-delivery-api", () => ({
  readLoyaltySmsSettings: () => mockRead(),
  saveLoyaltySmsFallback: (...args: unknown[]) => mockSave(...args),
  clearLoyaltySmsFallback: (...args: unknown[]) => mockClear(...args),
}));

const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings = { gatewayOnline: false, lastSeenAt: null, fallback: { configured: false, senderName: null } };
});

test("says plainly when no phone is online and nothing backs it up", async () => {
  render(<SmsFallbackCard tenantId={tenantId} />);
  await flush();
  expect(screen.getByText("○ No gateway phone is online")).toBeTruthy();
  expect(screen.getByText(/customers are asked to see the cashier/i)).toBeTruthy();
});

test("reports an online phone", async () => {
  mockSettings = { ...mockSettings, gatewayOnline: true };
  render(<SmsFallbackCard tenantId={tenantId} />);
  await flush();
  expect(screen.getByText("● A gateway phone is online")).toBeTruthy();
});

test("saves a Semaphore key with an optional sender name, trimmed", async () => {
  render(<SmsFallbackCard tenantId={tenantId} />);
  await flush();
  fireEvent.changeText(screen.getByLabelText("Semaphore API key"), `  ${KEY} `);
  fireEvent.changeText(screen.getByLabelText("Sender name"), " CAFE ");
  mockSettings = { ...mockSettings, fallback: { configured: true, senderName: "CAFE" } };
  fireEvent.press(screen.getByText("Save backup"));
  await flush();
  expect(mockSave).toHaveBeenCalledWith({}, tenantId, { apiKey: KEY, senderName: "CAFE" });
  expect(screen.getByText(/semaphore backup is on/i)).toBeTruthy();
});

test("a blank sender name is sent as null so Semaphore uses the account default", async () => {
  render(<SmsFallbackCard tenantId={tenantId} />);
  await flush();
  fireEvent.changeText(screen.getByLabelText("Semaphore API key"), KEY);
  fireEvent.press(screen.getByText("Save backup"));
  await flush();
  expect(mockSave).toHaveBeenCalledWith({}, tenantId, { apiKey: KEY, senderName: null });
});

test("shows the server's refusal and keeps the typed key", async () => {
  mockSave.mockResolvedValueOnce({ ok: false, error: "Semaphore did not accept this API key." });
  render(<SmsFallbackCard tenantId={tenantId} />);
  await flush();
  fireEvent.changeText(screen.getByLabelText("Semaphore API key"), KEY);
  fireEvent.press(screen.getByText("Save backup"));
  await flush();
  expect(screen.getByText("Semaphore did not accept this API key.")).toBeTruthy();
  expect(screen.getByLabelText("Semaphore API key").props.value).toBe(KEY);
});

test("removes a configured backup", async () => {
  mockSettings = { ...mockSettings, fallback: { configured: true, senderName: null } };
  render(<SmsFallbackCard tenantId={tenantId} />);
  await flush();
  mockSettings = { ...mockSettings, fallback: { configured: false, senderName: null } };
  fireEvent.press(screen.getByText("Remove backup"));
  await flush();
  expect(mockClear).toHaveBeenCalledWith({}, tenantId);
  expect(screen.getByLabelText("Semaphore API key")).toBeTruthy();
});
