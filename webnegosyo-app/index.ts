import "expo-router/entry";
import { AppRegistry } from "react-native";
import { LOYALTY_SMS_GATEWAY_TASK } from "./lib/loyalty/sms-gateway-task";

// The Android SMS gateway service runs this task with or without a UI (after a
// reboot it starts headless). The native side only asks for it once this bundle
// has finished evaluating, so registering after the router entry is in time.
// The task module is required lazily: a normal launch builds nothing for it.
AppRegistry.registerHeadlessTask(LOYALTY_SMS_GATEWAY_TASK, () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred until the service asks for the task
  require("./lib/loyalty/sms-gateway-runtime").loyaltySmsGatewayTask,
);
