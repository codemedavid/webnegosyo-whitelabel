/**
 * The Android runtime-permission client, shared by every path that sends.
 *
 * Extracted from `use-sms-run.ts` when the campaign editor gained a test send:
 * two copies of this would be two places for the iOS guard to be forgotten, and
 * on iOS `PermissionsAndroid` is a stub whose `check` resolves to a value that
 * must never be read as "granted".
 *
 * Unlike its neighbours in this directory, this module is not pure — it imports
 * `react-native` — so nothing under test imports it. The port it satisfies
 * (`SmsPermissionClient`) is what the tests exercise instead.
 */

import { PermissionsAndroid, Platform } from "react-native";
import type { SmsPermissionClient, SmsPermissionRequestResult } from "./types";

export const androidSmsPermissions: SmsPermissionClient = {
  async check() {
    if (Platform.OS !== "android") return false;
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS);
  },
  async request(): Promise<SmsPermissionRequestResult> {
    if (Platform.OS !== "android") return "denied";
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS);
    if (result === PermissionsAndroid.RESULTS.GRANTED) return "granted";
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return "never_ask_again";
    return "denied";
  },
};
