/**
 * Reads what `phone-info.ts` reports, from the real device. Not pure.
 *
 * Every native module is required lazily inside a try, field by field: this
 * runs inside the headless gateway task as well as the app, and a module that
 * is missing (older APK), throws (permission check in a headless context is
 * unverified) or hangs must cost that one field, never the claim. Battery
 * percentage is not reported: expo-battery is not in the shipped binaries;
 * "battery saver leaves the app alone" is the more useful flag anyway.
 */

import type * as ExpoDevice from "expo-device";
import type ExpoConstants from "expo-constants";
import type { SmsPermissionClient } from "../sms/types";
import { resolveGatewayNative } from "../loyalty/sms-gateway";

async function field<T>(read: () => T | Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

function device(): typeof ExpoDevice {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module resolved only when a claim asks
  return require("expo-device") as typeof ExpoDevice;
}

/** The installed binary's version (what the Play Store updates). */
export function readAppVersion(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module resolved only when a claim asks
    const constants = (require("expo-constants") as { default: typeof ExpoConstants }).default;
    const version = constants.nativeAppVersion ?? constants.expoConfig?.version;
    return typeof version === "string" && version ? version : null;
  } catch {
    return null;
  }
}

async function smsPermission(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- imports react-native; loaded only when a claim asks
  const { androidSmsPermissions } = require("../sms/android-permissions") as { androidSmsPermissions: SmsPermissionClient };
  return androidSmsPermissions.check();
}

async function batteryUnrestricted(): Promise<boolean | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional Android module; absent on iOS and older APKs
  const { SmsSenderModule } = require("../../modules/sms-sender") as { SmsSenderModule: unknown };
  const gateway = resolveGatewayNative(SmsSenderModule);
  return gateway ? gateway.isIgnoringBatteryOptimizations() : undefined;
}

/** This phone's maker and model, best effort (null when expo-device is missing or throws). */
export function readDeviceMaker(): { manufacturer: string | null; model: string | null } {
  try {
    return { manufacturer: device().manufacturer ?? null, model: device().modelName ?? null };
  } catch {
    return { manufacturer: null, model: null };
  }
}

export async function collectPhoneInfo(): Promise<Record<string, unknown>> {
  const [manufacturer, model, os, sms, bat] = await Promise.all([
    field(() => device().manufacturer),
    field(() => device().modelName),
    field(() => device().osVersion),
    field(smsPermission),
    field(batteryUnrestricted),
  ]);
  return { manufacturer, model, os, app: readAppVersion(), sms, bat };
}
