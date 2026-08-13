export type SmsPermissionRequestResult = 'granted' | 'denied' | 'never_ask_again';

export interface SmsPermissionClient {
  check(): Promise<boolean>;
  request(): Promise<SmsPermissionRequestResult>;
}

export interface NativeSmsClient {
  sendSms(phoneNumber: string, message: string): Promise<void>;
}

export interface SmsSenderDependencies {
  permissions: SmsPermissionClient;
  native: NativeSmsClient;
}

export class SmsPermissionDeniedError extends Error {
  constructor() {
    super('SMS permission was denied. Enable it in Android settings to send follow-up messages.');
    this.name = 'SmsPermissionDeniedError';
  }
}

export async function sendSmsWithPermission(
  phoneNumber: string,
  message: string,
  { permissions, native }: SmsSenderDependencies
): Promise<void> {
  const alreadyGranted = await permissions.check();

  if (!alreadyGranted) {
    const result = await permissions.request();
    if (result !== 'granted') {
      throw new SmsPermissionDeniedError();
    }
  }

  await native.sendSms(phoneNumber, message);
}
