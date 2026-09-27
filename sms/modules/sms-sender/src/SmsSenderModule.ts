import { NativeModule, requireNativeModule } from 'expo';

declare class SmsSenderModule extends NativeModule<Record<string, never>> {
  sendSms(phoneNumber: string, message: string): Promise<void>;
}

export default requireNativeModule<SmsSenderModule>('SmsSender');
