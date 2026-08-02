/**
 * Sending a campaign on the merchant's own say-so.
 *
 * Until this module the only way to send was to wait: a run existed only when
 * the schedule said the campaign was due, so a merchant who wrote a campaign
 * and wanted it out this afternoon had no button to press.
 *
 * Two rules make this more than a shortcut past the gate, and both are about
 * NOT sending twice or at the wrong hour:
 *
 *  - **A one-off is consumed by a manual send.** `lastRunAt` is a run's
 *    `completed_at`, not its `due_at`. Send a one-off dated the 10th on the 3rd
 *    and `computeNextDueAt` still finds the 10th ahead of the last run — the
 *    same guests get a second text. `consumesCampaign` is what the caller uses
 *    to retire it. A recurring campaign is untouched: its next cycle is a
 *    genuinely different occurrence.
 *  - **Quiet hours warn, they do not block** (changed 2026-08-03 at the
 *    merchant's request; it blocked for one day before that). Every SCHEDULED
 *    send is still shifted out of the quiet window by `shiftOutOfQuietHours`,
 *    which is where the guest protection actually lives. What changed is that a
 *    human deliberately pressing the button at 1am is no longer overruled by
 *    it — they get a sentence in the confirmation instead, so a late-night
 *    blast is a choice rather than an accident. The risk that sentence names is
 *    real: a 2am marketing text is how a SIM gets reported.
 *
 * The status rule is deliberately *looser* than the schedule's. `due-runs.ts`
 * fires only `active`, because that is a campaign going out on its own. Pressing
 * the button is not that, so a draft or paused campaign may still be sent by
 * hand. Only `archived` is refused, because archiving is how a campaign is
 * retired.
 */

import { isWithinQuietHours, toManilaParts } from "./schedule";
import type { CampaignStatus } from "./due-runs";
import type { ScheduleKind } from "./types";

export type SendNowBlock =
  | "unsupported_platform"
  | "unsaved"
  | "invalid"
  | "archived"
  | "in_progress"
  | "no_audience";

export interface SendNowInput {
  /** `Platform.OS` as react-native reports it. */
  platform: string;
  /** True while the editor is on an unsaved campaign. */
  isNew: boolean;
  isValid: boolean;
  status: CampaignStatus;
  isRunning: boolean;
  recipientCount: number;
  now: Date;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface SendNowDecision {
  canSend: boolean;
  block: SendNowBlock | null;
  /** Merchant-facing; safe to put straight on screen. */
  message: string;
  /**
   * A caution worth showing in the confirmation, without standing in the way.
   * Null when there is nothing to say.
   */
  warning: string | null;
}

/**
 * Whether the button may be pressed, and if not, the one thing worth saying.
 *
 * Checks run most-fundamental first: with several things wrong at once, telling
 * the merchant about the platform is the only useful answer, because fixing any
 * of the others would change nothing.
 */
export function decideSendNow(input: SendNowInput): SendNowDecision {
  if (input.platform !== "android") {
    return blocked(
      "unsupported_platform",
      "Texts send from the Android app, using that phone's SIM."
    );
  }

  if (input.isNew) {
    return blocked("unsaved", "Save this campaign first, then you can send it.");
  }

  if (!input.isValid) {
    return blocked("invalid", "Fix the errors above before sending.");
  }

  if (input.status === "archived") {
    return blocked(
      "archived",
      "This campaign is archived. Restore it before sending."
    );
  }

  if (input.isRunning) {
    return blocked("in_progress", "This campaign is already sending.");
  }

  if (input.recipientCount === 0) {
    return blocked(
      "no_audience",
      "Nobody matches this campaign yet, so there is nothing to send."
    );
  }

  const { time } = toManilaParts(input.now);
  const isQuiet = isWithinQuietHours(
    time,
    input.quietHoursStart,
    input.quietHoursEnd
  );

  return {
    canSend: true,
    block: null,
    message: "",
    warning: isQuiet
      ? `It is quiet hours — scheduled sends would wait until ${input.quietHoursEnd}. ` +
        "Sending now texts guests at this hour."
      : null,
  };
}

function blocked(block: SendNowBlock, message: string): SendNowDecision {
  return { canSend: false, block, message, warning: null };
}

const MS_PER_MINUTE = 60_000;

/**
 * The `due_at` to file a manual run under.
 *
 * Quantized down to the minute because `(campaign_id, due_at)` is unique: two
 * taps a second apart would otherwise create two run rows and text everybody
 * twice. Within the same minute they converge on one row, and the second tap
 * loses `claimRun` — which is the behaviour we want from a double-tap.
 */
export function immediateRunAt(now: Date): Date {
  return new Date(Math.floor(now.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE);
}

/**
 * Does sending this by hand use the campaign up?
 *
 * True for a one-off, whose own scheduled date would otherwise still be ahead
 * of `lastRunAt` and fire a second time. See the module comment.
 */
export function consumesCampaign(scheduleKind: ScheduleKind): boolean {
  return scheduleKind === "one_off";
}
