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
