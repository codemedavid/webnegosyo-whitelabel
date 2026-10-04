import { requireOptionalNativeModule } from "expo";

export interface SmsSenderNativeModule {
  /**
   * Send one SMS from the device's own SIM. Resolves only once the radio has
   * reported every part as sent; rejects with a `CodedError` whose `code` is
   * one of NO_SERVICE / RADIO_OFF / LIMIT_EXCEEDED / NULL_PDU / TIMEOUT /
   * GENERIC_FAILURE / SEND_FAILED.
   *
   * @param subscriptionId SIM to send from; null uses the device default.
   */
  sendSms(phoneNumber: string, message: string, subscriptionId: number | null): Promise<void>;

  /*
   * SMS gateway foreground service (loyalty reward codes). Absent on APKs
   * built before the gateway shipped — resolve through `resolveGatewayNative`
   * (lib/loyalty/sms-gateway.ts), never call these directly.
   */
  /** Persist the switch and start the service; it survives app close and reboot. */
  startSmsGateway?(config: { tenantId: string; actorId: string }): Promise<void>;
  /** Clear the switch and stop the service. Idempotent. */
  stopSmsGateway?(): Promise<void>;
  getSmsGatewayState?(): Promise<{ enabled: boolean; running: boolean }>;
  /** Replace the persistent notification's text. */
  setSmsGatewayStatus?(text: string): void;
  isIgnoringBatteryOptimizations?(): Promise<boolean>;
  /** Opens the system "allow background activity" prompt for this app. */
  requestIgnoreBatteryOptimizations?(): Promise<void>;
}

/**
 * The native module, or `null` on any platform that does not ship it.
 *
 * `requireOptionalNativeModule` (not `requireNativeModule`) is deliberate: the
 * module is declared android-only, so the required variant THROWS at import
 * time on the iOS binary. An import-time throw in this app is not theoretical —
 * an eagerly-constructed native module already caused a post-login SIGABRT once
 * (see docs/testing/, IOS_CRASH_FIX_PLAN.md). Callers must null-check.
 */
export const SmsSenderModule = requireOptionalNativeModule<SmsSenderNativeModule>("SmsSender");

export default SmsSenderModule;
