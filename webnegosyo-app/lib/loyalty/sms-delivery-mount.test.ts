import {
  nextPollDelayMs,
  LOYALTY_SMS_POLL_ACTIVE_MS,
  LOYALTY_SMS_POLL_BACKOFF_MS,
} from "./sms-delivery-mount";

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
