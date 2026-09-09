import { isSmsSupported, type SmsTransportOptions } from "../sms/transport";

export type LoyaltySmsTransport = {
  isAvailable: boolean;
  prepare(): Promise<boolean>;
  send(
    phone: string,
    body: string,
    stillAuthorized: () => boolean,
  ): Promise<void>;
};

// Reuses the existing Android native/permission ports, but never prompts after
// authorization: a permission dialog could outlive the OTP or active session.
export function createLoyaltySmsTransport(
  options: SmsTransportOptions,
): LoyaltySmsTransport {
  const { native, permissions, platform, subscriptionId = null } = options;
  const isAvailable = isSmsSupported(platform, native);
  return {
    isAvailable,
    async prepare() {
      if (!isAvailable) return false;
      try {
        return (
          (await permissions.check()) ||
          (await permissions.request()) === "granted"
        );
      } catch {
        return false;
      }
    },
    async send(phone, body, stillAuthorized) {
      if (
        !isAvailable ||
        !native ||
        !(await permissions.check()) ||
        !stillAuthorized()
      ) {
        throw new Error("Loyalty SMS delivery unavailable");
      }
      await native.sendSms(phone, body, subscriptionId);
    },
  };
}
