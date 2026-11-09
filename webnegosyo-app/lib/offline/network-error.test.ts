import { isNetworkFailure, isTokenRefusal, PartialOrderWriteError, refusalMessageOf } from "./network-error";

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

describe("a refusal for want of a token", () => {
  // A production deployment redacts a plain Error to a bare "Server Error", so
  // the gate's reason travels as ConvexError data; the message can't be trusted
  // to carry it. On a dev deployment it is the other way about.
  const fromProduction = Object.assign(new Error("[Request ID: 5f2] Server Error"), {
    data: "Unauthorized: unauthenticated",
  });
  const fromDevelopment = new Error(
    "[Request ID: 5f2] Server Error\nUncaught ConvexError: Unauthorized: unauthenticated\n  at requireAccess"
  );

  it("reads the reason from the error's data before its message", () => {
    expect(refusalMessageOf(fromProduction)).toBe("Unauthorized: unauthenticated");
    expect(refusalMessageOf(new Error("Not allowed"))).toBe("Not allowed");
    expect(refusalMessageOf("plain")).toBe("plain");
    expect(refusalMessageOf(Object.assign(new Error("Bad"), { data: { code: 1 } }))).toBe("Bad");
  });

  it("recognises it from production and from development", () => {
    expect(isTokenRefusal(fromProduction)).toBe(true);
    expect(isTokenRefusal(fromDevelopment)).toBe(true);
  });

  it("does not take any other refusal for it", () => {
    expect(isTokenRefusal(new Error("Unauthorized: wrong_tenant"))).toBe(false);
    expect(isTokenRefusal(Object.assign(new Error("x"), { data: "Unauthorized: unpinned" }))).toBe(false);
    expect(isTokenRefusal(new Error("[Request ID: 5f2] Server Error"))).toBe(false);
    expect(isTokenRefusal(null)).toBe(false);
  });

  it("is not an outage: the connection is fine, so the register stays online", () => {
    expect(isNetworkFailure(fromProduction)).toBe(false);
  });
});
