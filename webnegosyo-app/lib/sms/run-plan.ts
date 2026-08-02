/**
 * How much of an audience one run may actually text.
 *
 * Two independent constraints meet here:
 *
 *  - **Android's silent throttle.** Roughly 30 messages per 30 minutes per app,
 *    after which the system starts putting a confirmation dialog in front of
 *    every message. A 200-recipient blast does not fail loudly, it stalls
 *    behind a dialog the merchant will not be watching. So a run takes a capped
 *    batch and leaves the rest for the next one.
 *  - **Resumability.** A run that was interrupted (app killed, phone died) must
 *    resume without texting anyone twice, so recipients already recorded in
 *    `sms_sends` for this run are dropped before the cap is applied.
 *
 * The cap is applied to what is LEFT, not to the original audience — otherwise
 * a resumed run would shrink its own batch by the work it already did and could
 * never finish.
 */

import type { RunPlan, RunPlanOptions, SmsCustomer } from "./types";

export function planRun(
  audience: readonly SmsCustomer[],
  options: RunPlanOptions
): RunPlan {
  const alreadySent = new Set(options.alreadySentCustomerIds);
  const remaining = audience.filter((customer) => !alreadySent.has(customer.id));
  const cap = Math.max(0, options.maxPerRun);

  const batch = remaining.slice(0, cap);
  const deferred = remaining.slice(cap);

  return {
    batch,
    deferred,
    alreadySentCount: audience.length - remaining.length,
    isComplete: deferred.length === 0,
  };
}
