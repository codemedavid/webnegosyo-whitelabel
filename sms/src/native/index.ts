import { androidSmsPermissionClient } from './androidPermissionClient';
import { nativeSmsClient } from './nativeSmsClient';
import { sendSmsWithPermission } from './smsSender';

export { SmsPermissionDeniedError } from './smsSender';

export async function sendSms(phoneNumber: string, message: string): Promise<void> {
  return sendSmsWithPermission(phoneNumber, message, {
    permissions: androidSmsPermissionClient,
    native: nativeSmsClient,
  });
}
