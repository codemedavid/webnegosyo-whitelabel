/**
 * One campaign run, start to finish.
 *
 * This sits between the pure planner (`run-plan.ts`) and the pure send loop
 * (`send-run.ts`) and owns the two decisions that need the outside world:
 *
 *  1. **May this device send at all?** A store can have the owner's phone and a
 *     branch tablet both signed in, both seeing the same run come due. The
 *     claim is a conditional write — first device wins — and a device that
 *     loses sends nothing. Without it every guest gets the message twice.
 *
 *  2. **Is this run actually finished?** Only a run that worked through its
 *     whole audience without halting may be marked completed. A run that hit
 *     Android's throttle, was cancelled, or could not write its log is left
 *     open on purpose: marking it completed would retire it and strand every
 *     guest it never reached, with nothing in the UI to say so.
 *
 * Every side effect is injected, so the whole thing is testable without a
 * handset, a network, or a database.
 */

import { planRun } from "./run-plan";
import type { HaltReason, RunOutcome, SmsCustomer } from "./types";

export interface OrchestrateRunInput {
  runId: string;
  /** Stable per-installation id; the value written into `claimed_by_device`. */
  deviceId: string;
  template: string;
  storeName: string;
  maxPerRun: number;
  /** Already filtered by `selectAudience` — everyone here may be texted. */
  audience: readonly SmsCustomer[];
}

export type RunFinishStatus = "completed" | "partial";

export interface OrchestrateRunDeps {
  /** Conditional claim. Resolves false when another device already holds it. */
  claimRun(runId: string, deviceId: string): Promise<boolean>;
  /** Customers already recorded against this run, for resume. */
  listSentCustomerIds(runId: string): Promise<string[]>;
  /** Runs the send loop over one batch. */
  execute(batch: readonly SmsCustomer[], template: string, storeName: string): Promise<RunOutcome>;
  finishRun(runId: string, status: RunFinishStatus): Promise<void>;
}

export type RunStatus = "completed" | "partial" | "halted" | "claimed_elsewhere";

export interface OrchestratedRun {
  status: RunStatus;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  /** Recipients still waiting after this run; they roll into the next one. */
  remainingCount: number;
  haltedReason: HaltReason | null;
}

const NOTHING_SENT = { sentCount: 0, failedCount: 0, skippedCount: 0, haltedReason: null };

export async function orchestrateRun(
  input: OrchestrateRunInput,
  deps: OrchestrateRunDeps
): Promise<OrchestratedRun> {
  const claimed = await deps.claimRun(input.runId, input.deviceId);
  if (!claimed) {
    // Deliberately does NOT finish the run: the device that holds it will.
    return { status: "claimed_elsewhere", remainingCount: input.audience.length, ...NOTHING_SENT };
  }

  const alreadySentCustomerIds = await deps.listSentCustomerIds(input.runId);
  const plan = planRun(input.audience, {
    alreadySentCustomerIds,
    maxPerRun: input.maxPerRun,
  });

  if (plan.batch.length === 0) {
    // Either a resumed run with nothing left, or an audience nobody is in —
    // the normal case until checkout starts capturing consent. Finishing
    // cleanly beats leaving it open and looking stuck.
    await deps.finishRun(input.runId, "completed");
    return { status: "completed", remainingCount: 0, ...NOTHING_SENT };
  }

  const outcome = await deps.execute(plan.batch, input.template, input.storeName);

  const counts = {
    sentCount: outcome.sentCount,
    failedCount: outcome.failedCount,
    skippedCount: outcome.skippedCount,
    haltedReason: outcome.haltedReason,
  };

  if (outcome.haltedReason) {
    // A halt stops mid-batch, so the recipients the loop never reached are
    // still waiting alongside the ones the cap deferred. This subtraction is
    // only meaningful here: a run that did not halt attempted its whole batch
    // by definition, and deriving "unattempted" from the result count there
    // would inflate the remainder by every message it actually sent.
    const unattempted = Math.max(0, plan.batch.length - outcome.results.length);
    // Left open on purpose — see the module comment.
    return { status: "halted", remainingCount: plan.deferred.length + unattempted, ...counts };
  }

  const status: RunFinishStatus = plan.isComplete ? "completed" : "partial";
  await deps.finishRun(input.runId, status);

  return { status, remainingCount: plan.deferred.length, ...counts };
}
