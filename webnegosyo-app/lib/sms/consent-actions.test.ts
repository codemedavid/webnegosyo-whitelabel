/**
 * Recording a guest's consent from the merchant's own phone.
 *
 * The audience has been stuck at zero because consent only accrues when a guest
 * ticks a box at online checkout. Most of this merchant's guests order over the
 * counter and are never shown that box, so the campaign feature is unusable for
 * them on a technicality.
 *
 * This module is the merchant-attested path: the merchant asks the guest, the
 * guest says yes, the merchant taps a button. What these tests pin is that the
 * button can never be offered where consent would be a lie — no number to text,
 * an explicit opt-out on file, or a suppressed number — and that the row's badge
 * agrees with `audience.ts` the instant consent is recorded.
 */

import { consentActionFor, withConsentRecorded } from "./consent-actions";
import { customerReachability } from "./customer-list";
import { selectAudience } from "./audience";
import type { SmsCustomer } from "./types";

function customer(overrides: Partial<SmsCustomer> = {}): SmsCustomer {
  return {
    id: "c1",
    name: "Maria Santos",
    phone_e164: "+639170000001",
    order_count: 3,
    total_spent: 900,
    last_order_at: "2026-07-01T02:00:00.000Z",
    channels_used: ["pickup"],
    sms_consent: false,
    sms_opt_out: false,
    ...overrides,
  };
}

describe("consentActionFor", () => {
  it("offers to record consent for a guest who has a number and has not opted in", () => {
    const action = consentActionFor(customer(), []);

    expect(action.kind).toBe("record");
    expect(action.isEnabled).toBe(true);
  });

  it("offers to withdraw consent once it is on file", () => {
    const action = consentActionFor(customer({ sms_consent: true }), []);

    expect(action.kind).toBe("withdraw");
    expect(action.isEnabled).toBe(true);
  });

  it("cannot record consent for a guest with no number", () => {
    // Consent to be texted is meaningless without something to text.
    const action = consentActionFor(customer({ phone_e164: null }), []);

    expect(action.kind).toBe("blocked");
    expect(action.isEnabled).toBe(false);
    expect(action.reason).toMatch(/number/i);
  });

  it("cannot record consent over an explicit opt-out", () => {
    // The opt-out is the stronger statement and outranks consent everywhere
    // else in this domain; a one-tap override here would quietly undo it.
    const action = consentActionFor(customer({ sms_opt_out: true }), []);

    expect(action.kind).toBe("blocked");
    expect(action.isEnabled).toBe(false);
    expect(action.reason).toMatch(/asked not to be texted/i);
  });

  it("cannot record consent for a suppressed number", () => {
    const action = consentActionFor(customer(), ["+639170000001"]);

    expect(action.kind).toBe("blocked");
    expect(action.isEnabled).toBe(false);
  });

  it("blocks rather than offering to withdraw when consent sits behind an opt-out", () => {
    // Showing "Remove opt-in" would imply this guest is currently reachable.
    const action = consentActionFor(
      customer({ sms_consent: true, sms_opt_out: true }),
      []
    );

    expect(action.kind).toBe("blocked");
  });

  it("labels the action in the merchant's words, not the schema's", () => {
    expect(consentActionFor(customer(), []).label).toBe("They agreed to texts");
    expect(consentActionFor(customer({ sms_consent: true }), []).label).toBe(
      "Undo opt-in"
    );
  });
});

describe("withConsentRecorded", () => {
  it("returns a new customer rather than mutating the one passed in", () => {
    const original = customer();

    const updated = withConsentRecorded(original, true);

    expect(original.sms_consent).toBe(false);
    expect(updated).not.toBe(original);
    expect(updated.sms_consent).toBe(true);
  });

  it("makes the row read as textable the moment consent is recorded", () => {
    // The badge and the button must agree without a round-trip; a row that
    // still says "Not opted in" after the merchant taps reads as a failed save.
    const updated = withConsentRecorded(customer(), true);

    expect(customerReachability(updated, []).status).toBe("textable");
  });

  it("puts the guest into the send audience, not just the badge", () => {
    // The whole point of the button. If `audience.ts` still excludes them the
    // merchant records consent all afternoon and the campaign still sends zero.
    const updated = withConsentRecorded(customer(), true);

    const result = selectAudience([updated], {}, { now: "2026-08-03T02:00:00.000Z" });

    expect(result.recipients.map((r) => r.id)).toEqual(["c1"]);
  });

  it("takes the guest back out of the audience when consent is withdrawn", () => {
    const withdrawn = withConsentRecorded(customer({ sms_consent: true }), false);

    const result = selectAudience([withdrawn], {}, { now: "2026-08-03T02:00:00.000Z" });

    expect(result.recipients).toEqual([]);
    expect(result.summary.no_consent).toBe(1);
  });
});
