/**
 * Convex mirror of the web's recipient resolution (src/lib/lalamove-recipient.ts).
 *
 * The deployment cannot import from src/, so the rule lives twice. The two
 * suites make the same assertions on purpose — a booking must resolve the same
 * phone whichever backend the store is on.
 */
import { isE164Phone, normalizeLalamovePhone, resolveLalamoveRecipient } from "./lalamoveContact";

describe("normalizeLalamovePhone (convex)", () => {
  it("normalizes PH local formats and strips formatting inside + numbers", () => {
    expect(normalizeLalamovePhone("09171234567", "PH")).toBe("+639171234567");
    expect(normalizeLalamovePhone("+63 917-123 4567", "PH")).toBe("+639171234567");
    expect(normalizeLalamovePhone("+639081760718 ", "PH")).toBe("+639081760718");
    expect(normalizeLalamovePhone("", "PH")).toBe("");
    expect(normalizeLalamovePhone(undefined, "PH")).toBe("");
  });
});

describe("isE164Phone (convex)", () => {
  it("accepts bare E.164 and rejects anything else", () => {
    expect(isE164Phone("+639171234567")).toBe(true);
    expect(isE164Phone("")).toBe(false);
    expect(isE164Phone("09171234567")).toBe(false);
    expect(isE164Phone("ana@example.com")).toBe(false);
  });
});

describe("resolveLalamoveRecipient (convex)", () => {
  it("uses the customer contact when it is a phone number", () => {
    expect(resolveLalamoveRecipient("09171234567", undefined, "PH", "+639990000000")).toEqual({
      phone: "+639171234567",
      source: "customer",
    });
  });

  it("recovers the phone from customerData when the contact is blank", () => {
    expect(
      resolveLalamoveRecipient("", { contact_number: "0917 123 4567" }, "PH", "+639990000000"),
    ).toEqual({ phone: "+639171234567", source: "customer" });
  });

  it("falls back to the store phone when the order carries no phone at all", () => {
    expect(
      resolveLalamoveRecipient("", { delivery_address: "Enverga Blvd" }, "PH", "+639939212700"),
    ).toEqual({ phone: "+639939212700", source: "store" });
  });

  it("skips an email contact rather than sending it as a phone", () => {
    expect(resolveLalamoveRecipient("ana@example.com", {}, "PH", "+639939212700")).toEqual({
      phone: "+639939212700",
      source: "store",
    });
  });

  it("reports that nobody can be called when even the store has no phone", () => {
    expect(resolveLalamoveRecipient("", {}, "PH", "")).toEqual({ phone: "", source: "none" });
  });

  it("matches the phone field however the merchant labelled it", () => {
    for (const key of ["Phone", "Phone Number", "Contact No.", "MOBILE_NUMBER"]) {
      expect(
        resolveLalamoveRecipient("", { [key]: "+639171234519" }, "PH", "+639939212700"),
      ).toEqual({ phone: "+639171234519", source: "customer" });
    }
  });

  it("does not mistake a landline-looking address field for a phone", () => {
    expect(
      resolveLalamoveRecipient("", { delivery_address: "0917 Rizal St, Lucena" }, "PH", "+639939212700"),
    ).toEqual({ phone: "+639939212700", source: "store" });
  });
});
