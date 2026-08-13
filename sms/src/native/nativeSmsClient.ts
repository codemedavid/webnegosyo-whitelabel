import SmsSenderModule from '../../modules/sms-sender';
import type { NativeSmsClient } from './smsSender';

export const nativeSmsClient: NativeSmsClient = SmsSenderModule;
