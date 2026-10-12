/**
 * Which grants the owner should look at, and what a review may say.
 *
 * "Needs a look" = a grant still standing (not reversed), carrying at least one
 * high or medium flag (`needsReview`), that nobody has reviewed yet. Low flags
 * (self-approved, order edited, unusual PWD format) stay visible on the grant
 * but do not ask for attention. Same rule as the web report.
 */

import { GOV_FLAGS, needsReview, type GovFlag, type GovFlagInfo } from "../gov-discount";
import type { GrantEntry, ReviewVerdict } from "./types";

export function needsALook(grants: readonly GrantEntry[]): GrantEntry[] {
  return grants
    .filter((grant) => grant.reversedAt === null && grant.reviews.length === 0 && needsReview(grant.flags))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export interface FlagChip extends GovFlagInfo {
  flag: GovFlag;
}

/** The flags worth a chip, most severe first (already sorted on read). */
export function visibleFlags(flags: readonly GovFlag[]): FlagChip[] {
  return flags.map((flag) => ({ flag, ...GOV_FLAGS[flag] }));
}

export function latestVerdict(grant: Pick<GrantEntry, "reviews">): ReviewVerdict | null {
  return grant.reviews[0]?.verdict ?? null;
}

/** Same cap as the `gov_discount_reviews_note_ck` constraint. */
export const REVIEW_NOTE_MAX = 500;

export interface ReviewDraft {
  verdict: ReviewVerdict;
  note: string;
}

export type ReviewCheck =
  | { ok: true; verdict: ReviewVerdict; note: string | null }
  | { ok: false; message: string };

/** A problem needs a note so whoever follows it up knows what to look for. */
export function checkReview({ verdict, note }: ReviewDraft): ReviewCheck {
  const trimmed = note.trim();
  if (trimmed.length > REVIEW_NOTE_MAX) {
    return { ok: false, message: `Keep the note under ${REVIEW_NOTE_MAX} characters.` };
  }
  if (verdict === "problem" && trimmed === "") {
    return { ok: false, message: "Say what the problem is, so whoever follows it up knows." };
  }
  return { ok: true, verdict, note: trimmed === "" ? null : trimmed };
}
