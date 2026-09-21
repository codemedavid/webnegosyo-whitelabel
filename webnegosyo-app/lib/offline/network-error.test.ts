import { isNetworkFailure, PartialOrderWriteError } from "./network-error";

describe("isNetworkFailure", () => {
  it("recognises React Native's fetch failure", () => {
    expect(isNetworkFailure(new TypeError("Network request failed"))).toBe(true);
  });

  it("recognises the platform call timeout wrapper", () => {
    expect(
      isNetworkFailure(
        new Error("The request timed out (orders:createOrder). Check your connection and try again.")
      )
    ).toBe(true);
  });

  it("recognises an abort and GoTrue's retryable fetch error by name", () => {
    const abort = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    const retryable = Object.assign(new Error("x"), { name: "AuthRetryableFetchError" });
    expect(isNetworkFailure(abort)).toBe(true);
    expect(isNetworkFailure(retryable)).toBe(true);
  });

  it("treats a server refusal as NOT a network failure", () => {
    expect(isNetworkFailure(new Error("ArgumentValidationError: source is not in the validator"))).toBe(false);
    expect(isNetworkFailure(new Error("Order insert returned no row."))).toBe(false);
    expect(isNetworkFailure({ message: "duplicate key value violates unique constraint" })).toBe(false);
  });

  it("treats nothing, and unknown shapes, as not a network failure", () => {
    expect(isNetworkFailure(null)).toBe(false);
    expect(isNetworkFailure(undefined)).toBe(false);
    expect(isNetworkFailure(42)).toBe(false);
    expect(isNetworkFailure({})).toBe(false);
  });
});

describe("a partial order write is never an outage", () => {
  /**
   * `createOrder` writes the order row and its line items in two statements.
   * When the second fails it throws a message naming what is now sitting on the
   * till — and that message quotes the underlying reason. If the reason was a
   * network blip, the quoted text ("Network request failed") used to match the
   * patterns above, so the register filed the sale as "queued" and threw away
   * the one sentence telling the cashier to repair it. The replay then found
   * the order already there and returned early, so the items were never
   * written: a paid order with nothing on it, for good.
   */
  it("does not read a quoted network reason as an outage", () => {
    const error = new PartialOrderWriteError(
      "order-1",
      new Error("Network request failed")
    );

    expect(error.message).toContain("Network request failed");
    expect(isNetworkFailure(error)).toBe(false);
  });

  it("stays non-network for a timeout reason too", () => {
    expect(
      isNetworkFailure(new PartialOrderWriteError("order-1", new Error("timed out")))
    ).toBe(false);
  });

  it("names the order so the cashier can find it", () => {
    const error = new PartialOrderWriteError("order-7", new Error("23503"));
    expect(error.orderId).toBe("order-7");
    expect(error.message).toContain("order-7");
  });

  it("still treats a plain network error as an outage", () => {
    expect(isNetworkFailure(new Error("Network request failed"))).toBe(true);
  });
});
