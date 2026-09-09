import {
  shouldRunLoyaltySmsDelivery,
  nextPollDelayMs,
  LOYALTY_SMS_POLL_ACTIVE_MS,
  LOYALTY_SMS_POLL_BACKOFF_MS,
} from "./sms-delivery-mount";

const armed = {
  platform: "android",
  releaseEnabled: true,
  loyaltyEnabled: true,
  isDemo: false,
  isImpersonating: false,
  hasEnrollment: true,
  appState: "active",
};

test("runs only for an enrolled, live, foregrounded Android merchant session", () => {
  expect(shouldRunLoyaltySmsDelivery(armed)).toBe(true);
});

test.each([
  ["ios", { platform: "ios" }],
  ["release gate off", { releaseEnabled: false }],
  ["loyalty off", { loyaltyEnabled: false }],
  ["demo mode", { isDemo: true }],
  ["superadmin impersonation", { isImpersonating: true }],
  ["no enrollment", { hasEnrollment: false }],
  ["backgrounded", { appState: "background" }],
  ["inactive", { appState: "inactive" }],
])("never runs when %s", (_name, patch) => {
  expect(shouldRunLoyaltySmsDelivery({ ...armed, ...patch })).toBe(false);
});

test("polls quickly after work and backs off while idle or failing", () => {
  expect(nextPollDelayMs("sent")).toBe(LOYALTY_SMS_POLL_ACTIVE_MS);
  expect(nextPollDelayMs("recovered")).toBe(LOYALTY_SMS_POLL_ACTIVE_MS);
  expect(nextPollDelayMs("idle")).toBe(LOYALTY_SMS_POLL_ACTIVE_MS);
  expect(nextPollDelayMs("busy")).toBe(LOYALTY_SMS_POLL_ACTIVE_MS);
  expect(nextPollDelayMs("unavailable")).toBe(LOYALTY_SMS_POLL_BACKOFF_MS);
  expect(nextPollDelayMs("uncertain")).toBe(LOYALTY_SMS_POLL_BACKOFF_MS);
  expect(nextPollDelayMs("sent_unconfirmed")).toBe(LOYALTY_SMS_POLL_BACKOFF_MS);
  expect(nextPollDelayMs("recovery_required")).toBe(LOYALTY_SMS_POLL_BACKOFF_MS);
});
