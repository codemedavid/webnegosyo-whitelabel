import { colors } from "../../theme/colors";
import type { Tone } from "../../lib/loyalty/members";

/** Chip colours for a loyalty tone — one palette for every member surface. */
export const TONE_COLORS: Record<Tone, { bg: string; text: string }> = {
  success: { bg: colors.successLight, text: colors.success },
  accent: { bg: colors.accentLight, text: colors.accent },
  warning: { bg: colors.warningLight, text: "#92400E" },
  neutral: { bg: colors.primaryLight, text: colors.textPrimary },
};
