/**
 * Repeat-guest rate is only as trustworthy as the identity behind it.
 *
 * These tests pin the rules that stop the merchant app from either inventing
 * customers (every walk-in collapsing into one "guest") or losing them (the
 * same phone counted twice because one tenant's form names the field `phone`
 * and another's names it `contact_number`). They are the same rules
 * `src/lib/customer-identity.ts` and `src/lib/phone.ts` enforce on the web, so
 * a drift shows up here as a failure rather than as two dashboards disagreeing
 * about how loyal a branch's guests are.
 */

import { normalizePhoneE164 } from "./phone";
import {
  isIdentifiableContact,
  resolveCustomerIdentity,
  resolveOrderIdentityKey,
} from "./customer-identity";

describe("normalizePhoneE164", () => {
  it("normalizes every PH mobile shape to the same E.164 key", () => {
    // Arrange — the four ways the same person's number arrives.
    const shapes = ["09171234567", "+639171234567", "9171234567", "0917 123 4567"];

    // Act
    const keys = shapes.map((shape) => normalizePhoneE164(shape));

    // Assert
    expect(keys).toEqual([
      "+639171234567",
      "+639171234567",
      "+639171234567",
      "+639171234567",
    ]);
  });

  it("treats a 00 international prefix as the E.164 it stands in for", () => {
    expect(normalizePhoneE164("0063 917 123 4567")).toBe("+639171234567");
  });

  it("trusts only already-international input for a region it does not know", () => {
    // The parameter exists for a future market; until one is added, guessing a
    // national format would invent a customer.
    expect(normalizePhoneE164("+6591234567", "SG" as "PH")).toBe("+6591234567");
    expect(normalizePhoneE164("91234567", "SG" as "PH")).toBeNull();
  });

  it("returns null for input it cannot confidently normalize", () => {
    expect(normalizePhoneE164("12345")).toBeNull();
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164(undefined)).toBeNull();
  });
});

describe("isIdentifiableContact", () => {
  it("rejects the placeholders a counter staff types for a walk-in", () => {
    for (const placeholder of ["POS", "walk-in", "N/A", "guest", "-", "  "]) {
      expect(isIdentifiableContact(placeholder)).toBe(false);
    }
  });

  it("accepts a real contact", () => {
    expect(isIdentifiableContact("09171234567")).toBe(true);
  });
});

describe("resolveCustomerIdentity", () => {
  it("finds the phone whichever field name the tenant's form used", () => {
    const fieldNames = ["customer_phone", "phone", "mobile", "contact_number"];

    const keys = fieldNames.map(
      (field) => resolveCustomerIdentity({ customerData: { [field]: "0917 123 4567" } }).identityKey,
    );

    expect(keys).toEqual(Array(fieldNames.length).fill("phone:+639171234567"));
  });

  it("prefers phone over email so one person is not counted twice", () => {
    const identity = resolveCustomerIdentity({
      customerData: { customer_phone: "09171234567", customer_email: "ana@example.com" },
    });

    expect(identity.identityKey).toBe("phone:+639171234567");
    expect(identity.email).toBe("ana@example.com");
  });

  it("falls back to a normalized email when there is no usable phone", () => {
    const identity = resolveCustomerIdentity({
      customerData: { customer_email: "  Ana@Example.COM " },
    });

    expect(identity.identityKey).toBe("email:ana@example.com");
  });

  it("reads the flat contact field the older order shapes carry", () => {
    expect(resolveCustomerIdentity({ contact: "09171234567" }).identityKey).toBe(
      "phone:+639171234567",
    );
  });

  it("leaves an anonymous order unidentified rather than grouping walk-ins together", () => {
    const identity = resolveCustomerIdentity({ name: "Walk-in", contact: "POS" });

    expect(identity.identityKey).toBeNull();
    expect(identity.phoneE164).toBeNull();
    expect(identity.email).toBeNull();
  });

  it("keeps the customer's name even when they cannot be identified", () => {
    expect(resolveCustomerIdentity({ name: "Ana", contact: "walk-in" }).name).toBe("Ana");
  });
});

describe("resolveOrderIdentityKey", () => {
  it("reads the identity straight off an order row", () => {
    const order = { customerData: { customer_phone: "09171234567" } };

    expect(resolveOrderIdentityKey(order)).toBe("phone:+639171234567");
  });

  it("survives the untyped rows three backends hand over", () => {
    expect(resolveOrderIdentityKey(undefined)).toBeNull();
    expect(resolveOrderIdentityKey(null)).toBeNull();
    expect(resolveOrderIdentityKey({})).toBeNull();
    expect(resolveOrderIdentityKey({ customerData: "not-an-object" })).toBeNull();
    expect(resolveOrderIdentityKey({ customerData: ["array"] })).toBeNull();
  });

  it("reads the snake_case blob the platform-Supabase adapter may pass through", () => {
    expect(resolveOrderIdentityKey({ customer_data: { customer_phone: "09171234567" } })).toBe(
      "phone:+639171234567",
    );
  });
});
