/**
 * Assembles the loyalty OTP delivery worker from real device modules.
 *
 * Everything decision-shaped lives in the pure modules beside this file; this
 * is the one place that touches expo-secure-store, AsyncStorage, the Supabase
 * client and the Android SMS native module. It is called lazily from a mounted
 * component, never at render, for the reason `use-sms-run.ts` documents: a
 * native module constructed during render is what crashed the app post-login.
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type * as SecureStore from "expo-secure-store";
import { supabase } from "../supabase";
import { getWebAppUrl } from "../web-app-url";
import { androidSmsPermissions } from "../sms/android-permissions";
import type { SmsNativeClient } from "../sms/types";
import { createDeviceCredentialStore, type DeviceEnrollment } from "./device-credential-store";
import { createLoyaltySmsDeliveryApi, type DeliveryTransportDeps } from "./sms-delivery-api";
import { createLoyaltySmsTransport } from "./sms-transport";
import { createSmsDeliveryJournal } from "./sms-journal";
import { createLoyaltySmsWorker } from "./sms-worker";

type Scope = { tenantId: string; actorId: string };

// Old installed binaries may receive this JS with the release gate off. Loading
// expo-secure-store eagerly throws before React can evaluate that gate.
function secureStore(): typeof SecureStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module must load only after the release gate
  return require("expo-secure-store");
}

export function isDeviceCredentialStorageAvailable(): boolean {
  try { return typeof secureStore().getItemAsync === "function"; }
  catch { return false; }
}

export function deliveryTransportDeps(): DeliveryTransportDeps {
  return {
    webAppUrl: getWebAppUrl(),
    fetchImpl: (url, init) => fetch(url, init),
    getSession: () => supabase.auth.getSession(),
  };
}

export function deviceCredentialStore(scope: Scope) {
  return createDeviceCredentialStore({
    getItemAsync: (key) => secureStore().getItemAsync(key),
    setItemAsync: (key, value) => secureStore().setItemAsync(key, value),
    deleteItemAsync: (key) => secureStore().deleteItemAsync(key),
  }, scope);
}

export function createDeliveryWorker(
  scope: Scope,
  enrollment: DeviceEnrollment,
  canSend: () => boolean,
  onRevoked: () => void,
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional Android module is resolved only when mounting a worker
  const { SmsSenderModule } = require("../../modules/sms-sender") as typeof import("../../modules/sms-sender");
  const api = createLoyaltySmsDeliveryApi(
    deliveryTransportDeps(),
    { tenantId: scope.tenantId, device: enrollment },
    { onRevoked },
  );
  const transport = createLoyaltySmsTransport({
    platform: Platform.OS,
    native: SmsSenderModule as SmsNativeClient | null,
    permissions: androidSmsPermissions,
  });
  const journal = createSmsDeliveryJournal(AsyncStorage, {
    tenantId: scope.tenantId,
    actorId: scope.actorId,
    deviceId: enrollment.deviceId,
  });
  return createLoyaltySmsWorker({ api, transport, journal, canSend, now: () => Date.now() });
}
