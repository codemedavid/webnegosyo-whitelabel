/**
 * A store's Convex deployment can be several bundles behind the app. When it
 * is, a mutation the app has since learned to send is rejected by a validator
 * that has never heard of it — `orders:createOrder` with `source: "pos"` on a
 * deployment older than v9, for instance.
 *
 * Read screens already treat that as "this store needs a backend update"
 * (hooks.ts). Writes did not: the register alerted the cashier with the raw
 * Convex text — "ArgumentValidationError: Value does not match validator.
 * Path: .source Value: "pos" Validator: v.union(v.literal("web")…)" — which
 * tells a person standing at a till nothing they can act on.
 */
import {
  isStaleBundleError,
  staleBackendMessage,
} from "./stale-backend";

describe("isStaleBundleError", () => {
  it("recognises a validator rejection of an argument value", () => {
    const message =
      'ArgumentValidationError: Value does not match validator.\n' +
      'Path: .source\nValue: "pos"\n' +
      'Validator: v.union(v.literal("web"), v.literal("mobile"))';

    expect(isStaleBundleError(message)).toBe(true);
  });

  it("recognises a function that does not exist on the deployment", () => {
    expect(
      isStaleBundleError("Could not find public function for 'orders:reviseOrder'"),
    ).toBe(true);
  });

  it("recognises an argument the validator has never heard of", () => {
    expect(
      isStaleBundleError("Object contains extra field `outletId` that is not in the validator"),
    ).toBe(true);
  });

  it("does not claim an ordinary failure is a stale deployment", () => {
    expect(isStaleBundleError("Network request failed")).toBe(false);
    expect(isStaleBundleError("Insufficient stock for Latte")).toBe(false);
  });
});

describe("staleBackendMessage", () => {
  it("replaces a validator rejection with something a cashier can act on", () => {
    const err = new Error(
      'ArgumentValidationError: Value does not match validator.\nPath: .source\nValue: "pos"',
    );

    const message = staleBackendMessage(err);

    expect(message).toContain("needs a backend update");
    // The raw validator dump must not reach the till.
    expect(message).not.toContain("ArgumentValidationError");
    expect(message).not.toContain("v.literal");
  });

  it("passes an ordinary failure through unchanged", () => {
    expect(staleBackendMessage(new Error("Network request failed"))).toBe(
      "Network request failed",
    );
  });

  it("falls back to a usable sentence for a non-Error rejection", () => {
    expect(staleBackendMessage("boom")).toBe("Please try again.");
    expect(staleBackendMessage(undefined)).toBe("Please try again.");
  });

  it("says nothing was charged, because a rejected write created no order", () => {
    const err = new Error("ArgumentValidationError: Value does not match validator.");

    expect(staleBackendMessage(err)).toContain("was not saved");
  });
});
