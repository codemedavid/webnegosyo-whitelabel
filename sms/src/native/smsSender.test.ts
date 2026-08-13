import { sendSmsWithPermission, SmsPermissionDeniedError } from './smsSender';
import type { NativeSmsClient, SmsPermissionClient } from './smsSender';

function makePermissions(overrides: Partial<jest.Mocked<SmsPermissionClient>> = {}): jest.Mocked<SmsPermissionClient> {
  return {
    check: jest.fn().mockResolvedValue(false),
    request: jest.fn().mockResolvedValue('denied'),
    ...overrides,
  };
}

function makeNative(): jest.Mocked<NativeSmsClient> {
  return {
    sendSms: jest.fn().mockResolvedValue(undefined),
  };
}

describe('sendSmsWithPermission', () => {
  it('sends immediately without requesting when permission is already granted', async () => {
    const permissions = makePermissions({ check: jest.fn().mockResolvedValue(true) });
    const native = makeNative();

    await sendSmsWithPermission('+15555550100', 'Hi there', { permissions, native });

    expect(permissions.request).not.toHaveBeenCalled();
    expect(native.sendSms).toHaveBeenCalledWith('+15555550100', 'Hi there');
  });

  it('requests permission and sends when the request is granted', async () => {
    const permissions = makePermissions({ request: jest.fn().mockResolvedValue('granted') });
    const native = makeNative();

    await sendSmsWithPermission('+15555550100', 'Hi there', { permissions, native });

    expect(permissions.request).toHaveBeenCalled();
    expect(native.sendSms).toHaveBeenCalledWith('+15555550100', 'Hi there');
  });

  it('throws SmsPermissionDeniedError and never sends when the request is denied', async () => {
    const permissions = makePermissions({ request: jest.fn().mockResolvedValue('denied') });
    const native = makeNative();

    await expect(
      sendSmsWithPermission('+15555550100', 'Hi there', { permissions, native })
    ).rejects.toThrow(SmsPermissionDeniedError);
    expect(native.sendSms).not.toHaveBeenCalled();
  });

  it('throws SmsPermissionDeniedError when the request result is never_ask_again', async () => {
    const permissions = makePermissions({ request: jest.fn().mockResolvedValue('never_ask_again') });
    const native = makeNative();

    await expect(
      sendSmsWithPermission('+15555550100', 'Hi there', { permissions, native })
    ).rejects.toThrow(SmsPermissionDeniedError);
    expect(native.sendSms).not.toHaveBeenCalled();
  });
});
