import { MAX_POLL_MS, pollIntervalFor, toApprovalsError, unwrapApiResult } from "./polling";
import { POLL_INTERVAL_MS } from "./state";
import { approvalRequest } from "./test-fixtures";

describe("pollIntervalFor", () => {
  const startedAt = 1_000_000;

  test("polls every 10 s while a request is still moving and the screen is in view", () => {
    expect(pollIntervalFor([approvalRequest()], { isFocused: true, startedAt, now: startedAt + 1000 })).toBe(POLL_INTERVAL_MS);
    expect(pollIntervalFor([approvalRequest({ status: "executing" })], { isFocused: true, startedAt, now: startedAt })).toBe(POLL_INTERVAL_MS);
  });

  test("stops when every request is final, the screen is hidden, or the bound is reached", () => {
    expect(pollIntervalFor([approvalRequest({ status: "executed" })], { isFocused: true, startedAt, now: startedAt })).toBe(false);
    expect(pollIntervalFor([], { isFocused: true, startedAt, now: startedAt })).toBe(false);
    expect(pollIntervalFor([approvalRequest()], { isFocused: false, startedAt, now: startedAt })).toBe(false);
    expect(pollIntervalFor([approvalRequest()], { isFocused: true, startedAt, now: startedAt + MAX_POLL_MS + 1 })).toBe(false);
  });
});

describe("unwrapApiResult", () => {
  test("hands back the data or throws an error carrying the server's words and code", () => {
    expect(unwrapApiResult({ ok: true, status: 200, data: { a: 1 } })).toEqual({ a: 1 });
    try {
      unwrapApiResult({ ok: false, status: 409, error: "Refunds for this store type are coming soon.", code: "backend_unsupported" });
      throw new Error("should have thrown");
    } catch (error) {
      const known = toApprovalsError(error);
      expect(known).toEqual({ message: "Refunds for this store type are coming soon.", status: 409, code: "backend_unsupported" });
    }
  });

  test("an unknown throw reads as offline", () => {
    expect(toApprovalsError("boom")).toEqual({ message: "Something went wrong. Try again.", status: 0, code: null });
  });
});
