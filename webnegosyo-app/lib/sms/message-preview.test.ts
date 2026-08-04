/**
 * What the guest actually receives.
 *
 * The editor asked the merchant to write `Hi {{firstName}}, we miss you at
 * {{storeName}}!` into a bare textarea and then hit send to several hundred
 * people. Nothing on the screen ever showed the sentence that would arrive on
 * a handset. This module composes that sentence so the editor can show it.
 *
 * `renderMessage` THROWS on an unknown placeholder — correct for the send
 * path, where a typo must stop a blast — but a preview must never take the
 * screen down while the merchant is still mid-word. Everything here is total.
 */

import { buildMessagePreview, SAMPLE_GUEST } from "./message-preview";
import type { SmsCustomer } from "./types";

const STORE = "Nanay's Kitchen";

function guest(overrides: Partial<SmsCustomer> = {}): SmsCustomer {
  return {
    id: "cust-1",
    name: "Maria Santos",
    phone_e164: "+639170000001",
    order_count: 7,
    total_spent: 2400,
    last_order_at: "2026-07-02T04:00:00.000Z",
    channels_used: [],
    sms_consent: true,
    sms_opt_out: false,
    ...overrides,
  };
}

describe("buildMessagePreview", () => {
  it("substitutes a real recipient's own details", () => {
    const preview = buildMessagePreview("Hi {{firstName}}, come back!", guest(), STORE);

    expect(preview.body).toBe("Hi Maria, come back!");
    expect(preview.isSample).toBe(false);
  });

  it("uses the store's real name, not the placeholder", () => {
    const preview = buildMessagePreview("Salamat from {{storeName}}!", guest(), STORE);

    expect(preview.body).toBe("Salamat from Nanay's Kitchen!");
  });

  it("falls back to a sample guest when nobody matches the campaign yet", () => {
    // The audience is empty for most merchants until consent is recorded. A
    // preview that goes blank exactly then is missing when it is needed most.
    const preview = buildMessagePreview("Hi {{firstName}}!", null, STORE);

    expect(preview.body).toBe(`Hi ${SAMPLE_GUEST.name?.split(" ")[0]}!`);
    expect(preview.isSample).toBe(true);
  });

  it("names a placeholder the merchant typo'd instead of throwing", () => {
    const preview = buildMessagePreview("Hi {{frstName}}!", guest(), STORE);

    expect(preview.problem).toContain("frstName");
    expect(preview.problem).toContain("not a real");
  });

  it("still shows the raw message when a placeholder is wrong", () => {
    // Blanking the preview on a typo hides the very text being fixed.
    const preview = buildMessagePreview("Hi {{frstName}}!", guest(), STORE);

    expect(preview.body).toBe("Hi {{frstName}}!");
  });

  it("says the message is empty rather than drawing an empty bubble", () => {
    const preview = buildMessagePreview("   ", guest(), STORE);

    expect(preview.isEmpty).toBe(true);
    expect(preview.body).toBe("");
  });

  it("has no problem to report for a plain message", () => {
    expect(buildMessagePreview("Open today until 9pm.", guest(), STORE).problem).toBeNull();
  });

  it("names an unnamed guest the way the send path will", () => {
    // `MISSING_NAME_FALLBACK` is "there". The preview must show the same word
    // the recipient would get, or it is quietly lying about a real send.
    const preview = buildMessagePreview("Hi {{firstName}}!", guest({ name: null }), STORE);

    expect(preview.body).toBe("Hi there!");
  });
});

describe("SAMPLE_GUEST", () => {
  it("carries every field a template can reference", () => {
    // A sample missing `last_order_at` renders {{lastOrderDate}} as an empty
    // string, and the merchant reads a sentence with a hole in it.
    const preview = buildMessagePreview(
      "{{firstName}} {{name}} {{orderCount}} {{lastOrderDate}} {{totalSpent}}",
      null,
      STORE
    );

    expect(preview.body).not.toMatch(/\s\s/);
    expect(preview.body.trim()).not.toBe("");
  });
});
