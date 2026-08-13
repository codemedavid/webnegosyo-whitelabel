import { PermissionsAndroid } from 'react-native';
import { androidSmsPermissionClient } from './androidPermissionClient';

describe('androidSmsPermissionClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('check', () => {
    it('resolves true when the SEND_SMS permission is already granted', async () => {
      const checkSpy = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);

      const granted = await androidSmsPermissionClient.check();

      expect(granted).toBe(true);
      expect(checkSpy).toHaveBeenCalledWith('android.permission.SEND_SMS');
    });

    it('resolves false when the SEND_SMS permission is not granted', async () => {
      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);

      const granted = await androidSmsPermissionClient.check();

      expect(granted).toBe(false);
    });
  });

  describe('request', () => {
    it('maps the native GRANTED result to "granted"', async () => {
      const requestSpy = jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

      const result = await androidSmsPermissionClient.request();

      expect(result).toBe('granted');
      expect(requestSpy).toHaveBeenCalledWith('android.permission.SEND_SMS');
    });

    it('maps the native DENIED result to "denied"', async () => {
      jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

      const result = await androidSmsPermissionClient.request();

      expect(result).toBe('denied');
    });

    it('maps the native NEVER_ASK_AGAIN result to "never_ask_again"', async () => {
      jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);

      const result = await androidSmsPermissionClient.request();

      expect(result).toBe('never_ask_again');
    });
  });
});
