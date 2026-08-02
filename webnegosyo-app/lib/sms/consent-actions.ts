/**
 * Recording a guest's consent from the counter.
 *
 * Consent has only ever been written by the online checkout tick-box, so a
 * store whose guests order over the counter accrues none of it and every
 * campaign selects nobody. This module is the merchant-attested path: the
 * merchant asks, the guest agrees, the merchant taps.
 *
 * The rules below are deliberately narrow, because a one-tap consent button is
 * exactly the control that gets abused into a bulk opt-in. It is offered per
 * guest, never in bulk, and it is refused wherever recording consent would be
 * a lie:
 *
 *  - **No number.** Consent to be texted means nothing with nothing to text.
 *  - **An explicit opt-out.** The opt-out outranks consent everywhere else in
 *    this domain (`audience.ts`, `customer-list.ts`); letting a tap here
 *    override it would quietly undo a guest's own "do not text me".
 *  - **A suppressed number.** The suppression list is absolute for the send
 *    path, so it is absolute here too.
 *
 * The eligibility order mirrors `customer-list.ts` on purpose: the button and
 * the badge on the same row must never be able to disagree.
 */

import { customerReachability } from "./customer-list";
import type { SmsCustomer } from "./types";

export type ConsentActionKind = "record" | "withdraw" | "blocked";

export interface ConsentAction {
  kind: ConsentActionKind;
  /** Button text, in the merchant's words rather than the schema's. */
  label: string;
  /** Why the action is unavailable. Null whenever it is available. */
  reason: string | null;
  isEnabled: boolean;
}

const BLOCKED_REASONS: Record<string, string> = {
  no_phone: "Add a mobile number to this guest before recording consent.",
  opted_out: "This guest asked not to be texted. Allow texts again first.",
  suppressed: "This number is on the do-not-text list.",
};

/**
 * What the consent control on a guest's row should offer, if anything.
 *
 * Reachability is asked for rather than recomputed, so a change to who counts
 * as textable lands here in the same commit it lands on the badge.
 */
export function consentActionFor(
  customer: SmsCustomer,
  suppressedPhones: readonly string[]
): ConsentAction {
  const { status } = customerReachability(customer, suppressedPhones);

  const blockedReason = BLOCKED_REASONS[status];
  if (blockedReason) {
    return { kind: "blocked", label: "Cannot text", reason: blockedReason, isEnabled: false };
  }

  if (status === "textable") {
    return { kind: "withdraw", label: "Undo opt-in", reason: null, isEnabled: true };
  }

  return { kind: "record", label: "They agreed to texts", reason: null, isEnabled: true };
}

/**
 * The same guest with consent recorded or withdrawn.
 *
 * A new object, never a mutation: the screen updates optimistically off this
 * and has to be able to put the original back when the write fails.
 */
export function withConsentRecorded(
  customer: SmsCustomer,
  hasConsented: boolean
): SmsCustomer {
  return { ...customer, sms_consent: hasConsented };
}
