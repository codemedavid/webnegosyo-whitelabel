/**
 * The real dependencies of the SMS gateway headless task.
 *
 * Loaded lazily from `index.ts` only when the Android service starts the task,
 * so iOS and every non-gateway launch never construct a native module here.
 */

import { supabase } from "../supabase";
import { isLoyaltySmsDeliveryEnabled } from "./sms-delivery-flag";
import { createDeliveryWorker, deviceCredentialStore, smsGatewayNative } from "./sms-delivery-runtime";
import { createGatewayTask } from "./sms-gateway-task";

/** GoTrue serialises readers behind a stalled refresh; never wait forever. */
const SESSION_READ_TIMEOUT_MS = 8_000;

async function currentUserId(): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), SESSION_READ_TIMEOUT_MS);
  });
  try {
    const { data } = await Promise.race([supabase.auth.getSession(), timeout]);
    return data.session?.user.id ?? null;
  } finally {
    clearTimeout(timer);
  }
}

export const loyaltySmsGatewayTask = createGatewayTask({
  readEnrollment: (scope) => deviceCredentialStore(scope).read(),
  clearEnrollment: async (scope, enrollment) => {
    await deviceCredentialStore(scope).clearIfMatches(enrollment);
  },
  currentUserId,
  isReleaseEnabled: isLoyaltySmsDeliveryEnabled,
  isGatewayEnabled: async () => (await smsGatewayNative()?.getSmsGatewayState())?.enabled ?? false,
  createWorker: (scope, enrollment, canSend, onRevoked) =>
    createDeliveryWorker(scope, enrollment, canSend, onRevoked, { allowPrompt: false }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  setStatus: (text) => smsGatewayNative()?.setSmsGatewayStatus(text),
  stopService: async () => {
    await smsGatewayNative()?.stopSmsGateway();
  },
  now: () => Date.now(),
});
