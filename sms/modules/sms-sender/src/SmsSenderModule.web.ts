import { registerWebModule, NativeModule } from 'expo';

// SmsSenderModule is not available on the web platform.
class SmsSenderModule extends NativeModule<Record<string, never>> {}

export default registerWebModule(SmsSenderModule, 'SmsSenderModule');
