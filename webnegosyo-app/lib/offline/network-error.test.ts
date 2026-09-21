import { isNetworkFailure } from "./network-error";

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
