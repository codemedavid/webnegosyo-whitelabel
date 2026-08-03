import {
  SmsPermissionDeniedError,
  SmsUnavailableError,
  createSmsTransport,
  isSmsSupported,
} from "./transport";
import type { SmsPermissionClient, SmsNativeClient } from "./types";

function makePermissions(
  overrides: Partial<jest.Mocked<SmsPermissionClient>> = {}
): jest.Mocked<SmsPermissionClient> {
  return {
    check: jest.fn().mockResolvedValue(false),
    request: jest.fn().mockResolvedValue("granted"),
    ...overrides,
  } as jest.Mocked<SmsPermissionClient>;
}

function makeNative(): jest.Mocked<SmsNativeClient> {
  return { sendSms: jest.fn().mockResolvedValue(undefined) };
}

describe("isSmsSupported", () => {
  it("is supported only on Android with the native module present", () => {
    expect(isSmsSupported("android", makeNative())).toBe(true);
  });

  it("is unsupported on iOS even if a module were somehow linked", () => {
    // iOS has no equivalent API and the App Store forbids it outright; the
    // guard is platform-first so a stray build cannot expose the feature.
    expect(isSmsSupported("ios", makeNative())).toBe(false);
  });

  it("is unsupported on Android when the native module is missing", () => {
    // requireOptionalNativeModule returns null in Expo Go and on any build
    // that predates the module.
    expect(isSmsSupported("android", null)).toBe(false);
  });

  it("is unsupported on web", () => {
    expect(isSmsSupported("web", makeNative())).toBe(false);
  });
});

describe("createSmsTransport — unsupported platforms", () => {
  it("throws a typed error instead of crashing when sending on iOS", async () => {
    const transport = createSmsTransport({
      platform: "ios",
      native: makeNative(),
      permissions: makePermissions(),
    });

    await expect(transport.send("+639171234567", "hi")).rejects.toThrow(SmsUnavailableError);
  });

  it("never touches the native module on an unsupported platform", async () => {
    const native = makeNative();
    const transport = createSmsTransport({
      platform: "ios",
      native,
      permissions: makePermissions(),
    });

    await expect(transport.send("+639171234567", "hi")).rejects.toThrow();
    expect(native.sendSms).not.toHaveBeenCalled();
  });

  it("reports itself unavailable so the UI can hide rather than fail late", () => {
    const transport = createSmsTransport({
      platform: "ios",
      native: makeNative(),
      permissions: makePermissions(),
    });

    expect(transport.isAvailable).toBe(false);
  });
});

describe("createSmsTransport — permission handling", () => {
  it("sends straight away when permission is already granted", async () => {
    const permissions = makePermissions({ check: jest.fn().mockResolvedValue(true) });
    const native = makeNative();
    const transport = createSmsTransport({ platform: "android", native, permissions });

    await transport.send("+639171234567", "hi");

    expect(permissions.request).not.toHaveBeenCalled();
    expect(native.sendSms).toHaveBeenCalledWith("+639171234567", "hi", null);
  });

  it("asks once and sends when the merchant grants", async () => {
    const permissions = makePermissions({ request: jest.fn().mockResolvedValue("granted") });
    const native = makeNative();
    const transport = createSmsTransport({ platform: "android", native, permissions });

    await transport.send("+639171234567", "hi");

    expect(permissions.request).toHaveBeenCalledTimes(1);
    expect(native.sendSms).toHaveBeenCalled();
  });

  it("refuses to send when the merchant denies", async () => {
    const permissions = makePermissions({ request: jest.fn().mockResolvedValue("denied") });
    const native = makeNative();
    const transport = createSmsTransport({ platform: "android", native, permissions });

    await expect(transport.send("+639171234567", "hi")).rejects.toThrow(SmsPermissionDeniedError);
    expect(native.sendSms).not.toHaveBeenCalled();
  });

  it("tells the merchant to open Settings when the prompt will never appear again", async () => {
    const permissions = makePermissions({
      request: jest.fn().mockResolvedValue("never_ask_again"),
    });
    const transport = createSmsTransport({
      platform: "android",
      native: makeNative(),
      permissions,
    });

    await expect(transport.send("+639171234567", "hi")).rejects.toThrow(/Settings/i);
  });

  it("does not re-request on every message once granted in this session", async () => {
    const permissions = makePermissions({
      check: jest.fn().mockResolvedValue(false),
      request: jest.fn().mockResolvedValue("granted"),
    });
    const transport = createSmsTransport({
      platform: "android",
      native: makeNative(),
      permissions,
    });

    await transport.send("+639171234567", "one");
    await transport.send("+639171234567", "two");

    // A campaign sends dozens of messages; prompting per message would be
    // unusable, and Android would suppress the later prompts anyway.
    expect(permissions.request).toHaveBeenCalledTimes(1);
  });
});

describe("createSmsTransport — SIM selection", () => {
  it("passes the chosen subscription id through to the radio", async () => {
    const native = makeNative();
    const transport = createSmsTransport({
      platform: "android",
      native,
      permissions: makePermissions({ check: jest.fn().mockResolvedValue(true) }),
      subscriptionId: 2,
    });

    await transport.send("+639171234567", "hi");

    expect(native.sendSms).toHaveBeenCalledWith("+639171234567", "hi", 2);
  });

  it("passes null when no SIM was chosen, letting the device default win", async () => {
    const native = makeNative();
    const transport = createSmsTransport({
      platform: "android",
      native,
      permissions: makePermissions({ check: jest.fn().mockResolvedValue(true) }),
    });

    await transport.send("+639171234567", "hi");

    expect(native.sendSms).toHaveBeenCalledWith("+639171234567", "hi", null);
  });
});
