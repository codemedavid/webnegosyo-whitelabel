/**
 * Putting one message on the wire.
 *
 * A port, not a hard dependency on the handset. Today the only implementation
 * is the device's own SIM via the Android native module; if this app is ever
 * distributed through Google Play the same interface is satisfied by an SMS
 * gateway, and nothing above it — audience, template, schedule, run plan, send
 * loop, screens — has to change. That is the entire reason `send-run.ts` takes
 * a `sendSms` function rather than importing the native module.
 *
 * Two guards matter here:
 *
 *  - **Platform first.** iOS has no equivalent API and an SMS surface is a
 *    liability in App Store review, so the check is on the platform before the
 *    module, and an unsupported platform can never reach `native`.
 *  - **Permission once per transport, not once per message.** A campaign sends
 *    dozens of messages; prompting each time would be unusable, and Android
 *    suppresses repeat prompts anyway, so the answer is cached for the life of
 *    the transport.
 */

import type {
  SmsNativeClient,
  SmsPermissionClient,
  SmsTransport,
} from "./types";

export class SmsUnavailableError extends Error {
  constructor() {
    super("Sending SMS is only available on the Android app.");
    this.name = "SmsUnavailableError";
  }
}

export class SmsPermissionDeniedError extends Error {
  constructor(canAskAgain: boolean) {
    super(
      canAskAgain
        ? "Permission to send SMS was denied."
        : "Permission to send SMS was denied. Enable SMS for WebNegosyo in Android Settings to run campaigns."
    );
    this.name = "SmsPermissionDeniedError";
  }
}

/** Platform string as `react-native`'s `Platform.OS` reports it. */
export type PlatformName = string;

export function isSmsSupported(
  platform: PlatformName,
  native: SmsNativeClient | null
): boolean {
  return platform === "android" && native !== null;
}

export interface SmsTransportOptions {
  platform: PlatformName;
  native: SmsNativeClient | null;
  permissions: SmsPermissionClient;
  /** SIM to send from on a dual-SIM handset; null uses the device default. */
  subscriptionId?: number | null;
}

export function createSmsTransport(options: SmsTransportOptions): SmsTransport {
  const { platform, native, permissions, subscriptionId = null } = options;
  const isAvailable = isSmsSupported(platform, native);

  // Cached across sends for the life of this transport. Not module-level: a
  // stale global would survive a permission revoked in Settings mid-session.
  let hasPermission = false;

  async function ensurePermission(): Promise<void> {
    if (hasPermission) return;

    if (await permissions.check()) {
      hasPermission = true;
      return;
    }

    const result = await permissions.request();
    if (result !== "granted") {
      throw new SmsPermissionDeniedError(result === "denied");
    }
    hasPermission = true;
  }

  return {
    isAvailable,
    async send(phoneE164: string, body: string): Promise<void> {
      if (!isAvailable || !native) throw new SmsUnavailableError();

      await ensurePermission();
      await native.sendSms(phoneE164, body, subscriptionId);
    },
  };
}
