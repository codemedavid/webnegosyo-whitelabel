import { PermissionsAndroid } from 'react-native';
import type { SmsPermissionClient, SmsPermissionRequestResult } from './smsSender';

const SEND_SMS_PERMISSION = PermissionsAndroid.PERMISSIONS.SEND_SMS;

function mapPermissionResult(
  result: (typeof PermissionsAndroid.RESULTS)[keyof typeof PermissionsAndroid.RESULTS]
): SmsPermissionRequestResult {
  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return 'granted';
  }
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'never_ask_again';
  }
  return 'denied';
}

export const androidSmsPermissionClient: SmsPermissionClient = {
  async check(): Promise<boolean> {
    return PermissionsAndroid.check(SEND_SMS_PERMISSION);
  },

  async request(): Promise<SmsPermissionRequestResult> {
    const result = await PermissionsAndroid.request(SEND_SMS_PERMISSION);
    return mapPermissionResult(result);
  },
};
