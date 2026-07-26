// Presentation helpers shared by the platform (superadmin) console screens.
//
// Pure functions only — no React, no data access. Keeping the mapping from
// domain value to visual tone here means the same status renders identically
// on the list and the detail screen, and the mapping is testable without
// rendering a tree.

import { colors } from "../theme/colors";

/** Background/foreground pair for a pill. */
export interface Tone {
  bg: string;
  text: string;
}

const PLACEHOLDER_MONOGRAM = "?";
const MONOGRAM_LENGTH = 2;

/**
 * Two-glyph badge text for a name: the initials of the first two words, or the
 * first two letters when there is only one word.
 *
 * Always returns something renderable — a blank name yields a placeholder
 * rather than an empty string, so badges keep a uniform size in a list.
 */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return PLACEHOLDER_MONOGRAM;

  const initials =
    words.length === 1
      ? words[0].slice(0, MONOGRAM_LENGTH)
      : words.slice(0, MONOGRAM_LENGTH).map((word) => word[0]).join("");

  return initials.toUpperCase();
}

/**
 * Deterministic palette color for a seed (tenant id or name).
 *
 * Superadmins scan long lists by colour as much as by text, so the same store
 * must keep the same badge colour across renders, refreshes and sessions —
 * hence a hash of the seed rather than a random or index-based pick.
 */
export function monogramColor(seed: string): string {
  const palette = colors.avatarPalette;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    // djb2-style accumulation; `| 0` keeps it in int32 range.
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

const LEAD_TONES: Record<string, Tone> = {
  new: { bg: colors.warningLight, text: colors.warning },
  contacted: { bg: colors.infoLight, text: colors.info },
  qualified: { bg: colors.accentLight, text: colors.accent },
  converted: { bg: colors.successLight, text: colors.success },
  lost: { bg: colors.dangerLight, text: colors.danger },
};

const NEUTRAL_TONE: Tone = { bg: colors.infoLight, text: colors.info };

/**
 * Pill tone for a lead's pipeline status. Unknown statuses fall back to a
 * neutral pill: the DB CHECK constraint can gain a value before the app ships,
 * and an unstyled crash is worse than a plain grey badge.
 */
export function leadStatusTone(status: string): Tone {
  return LEAD_TONES[status] ?? NEUTRAL_TONE;
}

/**
 * Pill tone for a restaurant's active flag. Inactive is a normal lifecycle
 * state rather than a fault, so it reads muted instead of danger red.
 */
export function tenantStatusTone(isActive: boolean): Tone {
  return isActive
    ? { bg: colors.successLight, text: colors.success }
    : { bg: colors.primaryLight, text: colors.textSecondary };
}

/** "1 restaurant" / "3 restaurants" — avoids "1 restaurants" in summary lines. */
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count} ${word}`;
}
