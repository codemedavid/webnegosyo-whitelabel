/**
 * Texting yourself the message before texting everyone else.
 *
 * The send pipeline has only ever been exercised against fakes — the Kotlin
 * module has never put a message on a real network. Short of activating a
 * campaign and blasting real guests, there has been no way to find that out,
 * which is precisely the wrong first test.
 *
 * A test send is a REHEARSAL, and the design follows from that word:
 *
 *  - The body is rendered by the same renderer a real run uses, from the
 *    campaign's own template. A message arriving as "Hi {{firstName}}" would
 *    prove the rehearsal fake and nothing about the campaign.
 *  - Nothing is prefixed, truncated or tagged. A body that differs from the
 *    real one makes the segment count a lie.
 *  - The plan carries no run or customer id, and callers hand it to the
 *    transport directly. A row in `sms_sends` — the idempotency unit — would
 *    make a resumed run skip a real guest who was never texted.
 *
 * A bad number or a broken template is refused here, cheaply, rather than
 * discovered part-way through a run.
 */

import { normalizePhoneE164 } from "../phone";
import {
  countSmsSegments,
  renderMessage,
  validateTemplate,
  type SmsEncoding,
} from "./message-template";
import type { SmsCustomer } from "./types";

export interface TestSendInput {
  /** However the merchant types their own number. */
  phone: string;
  template: string;
  storeName: string;
}

export interface TestSendPlan {
  phoneE164: string;
  /** Byte-for-byte what a guest would receive from this template. */
  body: string;
  segments: number;
  encoding: SmsEncoding;
}

export type TestSendResult =
  | { ok: true; plan: TestSendPlan }
  | { ok: false; error: string };

/**
 * The stand-in guest.
 *
 * Every value is plausible rather than blank, so a template using
 * `{{lastOrderDate}}` rehearses as a date and not as a gap the merchant only
 * notices on the real send.
 */
const SAMPLE_GUEST: SmsCustomer = {
  id: "sample",
  name: "Maria Santos",
  phone_e164: null,
  order_count: 4,
  total_spent: 1200,
  last_order_at: "2026-07-01T02:00:00.000Z",
  channels_used: ["pickup"],
  sms_consent: true,
  sms_opt_out: false,
};

export function planTestSend(input: TestSendInput): TestSendResult {
  const phoneE164 = normalizePhoneE164(input.phone);
  if (!phoneE164) {
    return {
      ok: false,
      error: "That does not look like a mobile number. Try 0917 123 4567.",
    };
  }

  if (input.template.trim() === "") {
    return { ok: false, error: "Write the message first, then send yourself a test." };
  }

  const template = validateTemplate(input.template);
  if (!template.isValid) {
    return {
      ok: false,
      error: `Unknown variable: ${template.unknownVariables.join(", ")}`,
    };
  }

  const body = renderMessage(input.template, SAMPLE_GUEST, { storeName: input.storeName });
  const { segments, encoding } = countSmsSegments(body);

  return { ok: true, plan: { phoneE164, body, segments, encoding } };
}
