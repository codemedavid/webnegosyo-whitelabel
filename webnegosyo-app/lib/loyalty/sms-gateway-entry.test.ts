/**
 * The gateway service starts its headless task with no UI (after a reboot,
 * app swiped away). The router renders no routes then, so the task can only
 * be registered from the bundle entry. These guard the two edits that would
 * silently break that: pointing `main` back at expo-router/entry, or moving
 * the registration out of index.ts. Source-level, like the other guardrails.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { LOYALTY_SMS_GATEWAY_TASK } from "./sms-gateway-task";

const root = join(__dirname, "..", "..");

test("the bundle entry is index.ts", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { main: string };
  expect(pkg.main).toBe("index.ts");
});

test("index.ts boots the router and registers the gateway task lazily", () => {
  const source = readFileSync(join(root, "index.ts"), "utf8");
  expect(source).toContain('import "expo-router/entry"');
  expect(source).toContain("AppRegistry.registerHeadlessTask(LOYALTY_SMS_GATEWAY_TASK");
  expect(source).toContain('require("./lib/loyalty/sms-gateway-runtime")');
  expect(source).not.toMatch(/import .*sms-gateway-runtime/);
});

test("the native service asks for the same task name", () => {
  const service = readFileSync(
    join(root, "modules/sms-sender/android/src/main/java/expo/modules/smssender/LoyaltySmsGatewayService.kt"),
    "utf8",
  );
  expect(service).toContain(`"${LOYALTY_SMS_GATEWAY_TASK}"`);
});
