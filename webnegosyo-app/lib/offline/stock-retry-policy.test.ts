import {
  MAX_STOCK_ATTEMPTS,
  STOCK_RETRY_BASE_MS,
  nextStockRetryAt,
  settleStockOutcome,
} from "./stock-retry-policy";

/**
 * ONE policy for every stock call a device keeps owing — a counter sale in the
 * sales outbox and a status change / edit / QR sale in the stock-call queue —
 * so the two cannot drift apart on backoff or on when to give up.
 */
describe("settleStockOutcome", () => {
  it("is done once the platform accepted the call", () => {
    expect(settleStockOutcome({ attempts: 3 }, "ok", 1_000)).toEqual({ verdict: "done" });
  });

  it("abandons a permanent refusal at once, counting the attempt", () => {
    expect(settleStockOutcome({ attempts: 0 }, "permanent", 1_000)).toEqual({
      verdict: "abandoned",
      reason: "refused",
      attempts: 1,
    });
  });

  it("keeps a transient failure owed with the next backoff", () => {
    expect(settleStockOutcome({ attempts: 0 }, "retry", 1_000)).toEqual({
      verdict: "owed",
      attempts: 1,
      retryAt: 1_000 + STOCK_RETRY_BASE_MS,
    });
    expect(settleStockOutcome({ attempts: 2 }, "retry", 0)).toEqual({
      verdict: "owed",
      attempts: 3,
      retryAt: nextStockRetryAt(0, 3),
    });
  });

  it("abandons a transient failure on the last allowed attempt", () => {
    expect(settleStockOutcome({ attempts: MAX_STOCK_ATTEMPTS - 1 }, "retry", 0)).toEqual({
      verdict: "abandoned",
      reason: "exhausted",
      attempts: MAX_STOCK_ATTEMPTS,
    });
  });
});
