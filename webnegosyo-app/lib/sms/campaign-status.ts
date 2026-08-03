/**
 * Moving a campaign between draft, active, paused and archived.
 *
 * This exists because of a dead end: `due-runs.ts` correctly refuses to fire
 * anything that is not `active`, campaigns are created as `draft`, and until
 * this module there was no way to get from one to the other — a saved campaign
 * simply never became due.
 *
 * Two rules are deliberate:
 *
 *  - **Archived is terminal.** Reviving an archived campaign would resurrect a
 *    schedule the merchant retired, and because due-ness is anchored on the
 *    last run, a long-dormant one could come due the instant it went active.
 *    Making a fresh campaign is the safe path, and it is cheap.
 *  - **An invalid draft cannot go live.** Activating one puts it on a schedule
 *    it can never satisfy (`computeNextDueAt` returns null for an
 *    under-specified schedule), so it would sit in the list looking live and
 *    silently never send — the exact failure the weekly-weekday constraint bug
 *    would have caused.
 */

import type { CampaignStatus } from "./due-runs";

export interface StatusAction {
  next: CampaignStatus;
  label: string;
  /** True for actions that end a campaign's life; the UI styles these apart. */
  isDestructive: boolean;
}

const ARCHIVE: StatusAction = { next: "archived", label: "Archive", isDestructive: true };

const ACTIONS: Record<CampaignStatus, StatusAction[]> = {
  draft: [{ next: "active", label: "Activate", isDestructive: false }, ARCHIVE],
  // "Resume" rather than "Activate": the campaign is already set up, and
  // "Activate" on something configured reads like starting over.
  paused: [{ next: "active", label: "Resume", isDestructive: false }, ARCHIVE],
  active: [{ next: "paused", label: "Pause", isDestructive: false }, ARCHIVE],
  archived: [],
};

const LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export function statusActionsFor(status: CampaignStatus): StatusAction[] {
  return ACTIONS[status] ?? [];
}

/** Whether this campaign may be put live right now. */
export function canActivate(status: CampaignStatus, isValid: boolean): boolean {
  if (status === "archived" || status === "active") return false;
  return isValid;
}

export function statusLabel(status: CampaignStatus): string {
  return LABELS[status] ?? status;
}
