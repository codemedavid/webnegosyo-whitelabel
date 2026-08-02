import {
  MISSING_NAME_FALLBACK,
  TemplateVariableError,
  buildTemplateVariables,
  countSmsSegments,
  extractVariables,
  renderMessage,
  validateTemplate,
} from "./message-template";
import type { SmsCustomer } from "./types";

function customer(overrides: Partial<SmsCustomer> = {}): SmsCustomer {
  return {
    id: "c1",
    name: "Maria Santos",
    phone_e164: "+639171234567",
    order_count: 3,
    total_spent: 1200,
    last_order_at: "2026-07-01T02:00:00.000Z",
    channels_used: ["pickup"],
    sms_consent: true,
    sms_opt_out: false,
    ...overrides,
  };
}

const STORE = { storeName: "Aling Nena's" };

describe("buildTemplateVariables", () => {
  it("exposes the customer's first name for a friendly greeting", () => {
    expect(buildTemplateVariables(customer(), STORE).firstName).toBe("Maria");
  });

  it("falls back to a neutral word rather than an empty greeting when the name is missing", () => {
    expect(buildTemplateVariables(customer({ name: null }), STORE).firstName).toBe(
      MISSING_NAME_FALLBACK
    );
    expect(buildTemplateVariables(customer({ name: "   " }), STORE).firstName).toBe(
      MISSING_NAME_FALLBACK
    );
  });

  it("exposes order history the merchant can reference", () => {
    const vars = buildTemplateVariables(customer(), STORE);

    expect(vars.orderCount).toBe("3");
    expect(vars.storeName).toBe("Aling Nena's");
  });

  it("formats the last order date in Manila local time, not UTC", () => {
    // 2026-07-01T18:00Z is already 2 July in Manila (UTC+8).
    const vars = buildTemplateVariables(
      customer({ last_order_at: "2026-07-01T18:00:00.000Z" }),
      STORE
    );

    expect(vars.lastOrderDate).toBe("Jul 2, 2026");
  });

  it("leaves the last order date empty for a customer who has never ordered", () => {
    expect(buildTemplateVariables(customer({ last_order_at: null }), STORE).lastOrderDate).toBe("");
  });
});

describe("renderMessage", () => {
  it("substitutes every placeholder", () => {
    const body = renderMessage("Hi {{firstName}}, {{storeName}} misses you!", customer(), STORE);

    expect(body).toBe("Hi Maria, Aling Nena's misses you!");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderMessage("Hi {{ firstName }}!", customer(), STORE)).toBe("Hi Maria!");
  });

  it("substitutes a repeated placeholder everywhere it appears", () => {
    expect(renderMessage("{{firstName}}, {{firstName}}!", customer(), STORE)).toBe("Maria, Maria!");
  });

  it("throws with the offending names when the template uses an unknown variable", () => {
    expect(() => renderMessage("Hi {{nickname}} of {{planet}}", customer(), STORE)).toThrow(
      TemplateVariableError
    );

    try {
      renderMessage("Hi {{nickname}} of {{planet}}", customer(), STORE);
    } catch (error) {
      expect((error as TemplateVariableError).missingVariables).toEqual(["nickname", "planet"]);
    }
  });

  it("returns a template with no placeholders unchanged", () => {
    expect(renderMessage("Fresh pandesal today!", customer(), STORE)).toBe("Fresh pandesal today!");
  });
});

describe("extractVariables / validateTemplate — the campaign editor's guard rails", () => {
  it("lists the placeholders a template uses, without duplicates", () => {
    expect(extractVariables("{{firstName}} {{storeName}} {{firstName}}")).toEqual([
      "firstName",
      "storeName",
    ]);
  });

  it("accepts a template that only uses known variables", () => {
    expect(validateTemplate("Hi {{firstName}} from {{storeName}}")).toEqual({
      isValid: true,
      unknownVariables: [],
    });
  });

  it("rejects a template with an unknown variable before it can ever be sent", () => {
    expect(validateTemplate("Hi {{nickname}}")).toEqual({
      isValid: false,
      unknownVariables: ["nickname"],
    });
  });
});

describe("countSmsSegments — what the merchant will actually be charged for", () => {
  it("counts a short plain message as one segment", () => {
    expect(countSmsSegments("Hello")).toEqual({ length: 5, segments: 1, encoding: "GSM7" });
  });

  it("counts exactly 160 GSM characters as one segment", () => {
    expect(countSmsSegments("a".repeat(160)).segments).toBe(1);
  });

  it("splits at 153 characters per part once a message goes multipart", () => {
    expect(countSmsSegments("a".repeat(161)).segments).toBe(2);
    expect(countSmsSegments("a".repeat(306)).segments).toBe(2);
    expect(countSmsSegments("a".repeat(307)).segments).toBe(3);
  });

  it("charges an emoji as UCS-2, where the limit collapses to 70 characters", () => {
    const result = countSmsSegments("Salamat! 🎉");

    expect(result.encoding).toBe("UCS2");
    expect(result.segments).toBe(1);
  });

  it("treats a single non-GSM character as making the whole message UCS-2", () => {
    // One accented character re-encodes the entire message — the classic
    // "why did my 1-segment blast cost 3x" surprise.
    expect(countSmsSegments(`${"a".repeat(100)}ñ`).encoding).toBe("UCS2");
    expect(countSmsSegments(`${"a".repeat(100)}ñ`).segments).toBe(2);
  });

  it("counts a GSM extension character as two, the way the carrier does", () => {
    // { } [ ] ~ ^ \ | € occupy two septets each.
    expect(countSmsSegments("{").length).toBe(2);
  });

  it("counts an empty message as zero segments", () => {
    expect(countSmsSegments("")).toEqual({ length: 0, segments: 0, encoding: "GSM7" });
  });
});
