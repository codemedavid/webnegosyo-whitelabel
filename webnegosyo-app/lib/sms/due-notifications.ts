/**
 * Telling the merchant a campaign is ready.
 *
 * Due-ness has been computed since Phase 5 but only ever *displayed*: a campaign
 * became due silently and stayed that way until someone happened to open the
 * Customers tab. A 10am Monday win-back sent Thursday afternoon, if at all,
 * which makes the whole scheduling feature decorative.
 *
 * Background *sending* was rejected on purpose — OEM battery managers kill
 * WorkManager, so a silent auto-send is unreliable in exactly the way that
 * matters. A local notification is a different proposition: scheduled for a
 * future instant, Android delivers it itself with the app closed, and the
 * merchant still taps Send. This module decides what to hand the scheduler.
 *
 * The load-bearing rule is the dedupe, and the unit of identity is one
 * campaign's ONE due moment rather than the campaign:
 *
 *  - Keyed on the campaign, a recurring campaign would be silenced forever
 *    after its first notification.
 *  - Keyed on nothing, every app launch would stack another notification for
 *    the same occurrence.
 *
 * Nothing here touches Android. It takes the states, the keys already handled,
 * and the clock; the caller does the scheduling and the persisting.
 */

import { shiftOutOfQuietHours } from "./schedule";
import type { CampaignDueState } from "./due-runs";

export interface DueNotification {
  /** Occurrence identity — one campaign, one due moment. */
  key: string;
  campaignId: string;
  title: string;
  body: string;
  /** When the phone should deliver it. */
  fireAt: Date;
}

export interface DueNotificationInput {
  states: readonly CampaignDueState[];
  /** Occurrence keys already scheduled on this device. */
  knownKeys: readonly string[];
  now: Date;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface DueNotificationPlan {
  /** Occurrences to hand to the scheduler. */
  schedule: DueNotification[];
  /** Previously scheduled keys that no longer match a live occurrence. */
  cancelKeys: string[];
  /** Every live occurrence key; persist this as the next run's `knownKeys`. */
  keepKeys: string[];
}

const KEY_SEPARATOR = "@";

/**
 * The identity of one due occurrence.
 *
 * The due instant is part of the key so that rescheduling a campaign produces a
 * different occurrence — which is what lets the old, now-wrong notification be
 * cancelled rather than left sitting in Android's queue.
 */
export function occurrenceKey(campaignId: string, dueAt: Date): string {
  return `${campaignId}${KEY_SEPARATOR}${dueAt.toISOString()}`;
}

function bodyFor(state: CampaignDueState): string {
  return `${state.name} is ready to send. Open WebNegosyo and tap Send.`;
}

/**
 * When the phone should actually deliver this.
 *
 * An overdue campaign fires now rather than being skipped — the merchant missed
 * it, and silence leaves the audience waiting indefinitely. Either way the
 * moment is pushed out of quiet hours: a marketing prompt that wakes the
 * merchant at 2am is how this feature gets switched off entirely.
 */
function fireAtFor(state: CampaignDueState, input: DueNotificationInput): Date {
  const dueAt = state.dueAt as Date;
  const raw = state.isDue ? input.now : dueAt;
  return shiftOutOfQuietHours(raw, input.quietHoursStart, input.quietHoursEnd);
}

/** Only an active campaign with a due moment still ahead of it can notify. */
function isNotifiable(state: CampaignDueState): boolean {
  return state.status === "active" && state.dueAt !== null;
}

export function planDueNotifications(
  input: DueNotificationInput
): DueNotificationPlan {
  const live = input.states.filter(isNotifiable);

  const keepKeys = live.map((state) =>
    occurrenceKey(state.campaignId, state.dueAt as Date)
  );
  const liveKeys = new Set(keepKeys);

  const schedule = live
    .filter((state) => !input.knownKeys.includes(occurrenceKey(state.campaignId, state.dueAt as Date)))
    .map((state) => ({
      key: occurrenceKey(state.campaignId, state.dueAt as Date),
      campaignId: state.campaignId,
      title: "Campaign ready to send",
      body: bodyFor(state),
      fireAt: fireAtFor(state, input),
    }));

  // Anything remembered that is no longer a live occurrence: paused, archived,
  // deleted, rescheduled, or already run. Its notification must not still fire.
  const cancelKeys = input.knownKeys.filter((key) => !liveKeys.has(key));

  return { schedule, cancelKeys, keepKeys };
}
