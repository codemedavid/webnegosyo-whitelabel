import type { DenominationKey } from "../../lib/cash/denominations";
import { colors } from "../../theme/colors";

/**
 * Chip colours for each denomination, close to the NGC banknote hues the
 * mockups proposed (₱1000 blue, ₱500 yellow, ₱200 green, ₱100 violet, ₱50 red,
 * ₱20 orange) but drawn only from existing theme tokens, so a theme change
 * reaches the counter too. Coins share one neutral look. The tint is a cue,
 * never the only signal: every chip also prints its value.
 */
export interface DenominationLook {
  background: string;
  ink: string;
}

const COIN: DenominationLook = { background: colors.surfaceSubtle, ink: colors.textMuted };

const BILLS: Partial<Record<DenominationKey, DenominationLook>> = {
  b1000: { background: colors.statusConfirmed.bg, ink: colors.statusConfirmed.text },
  b500: { background: colors.statusPending.bg, ink: colors.statusPending.text },
  b200: { background: colors.statusReady.bg, ink: colors.statusReady.text },
  b100: { background: colors.expenseGroups.occupancy.tint, ink: colors.expenseGroups.occupancy.ink },
  b50: { background: colors.statusCancelled.bg, ink: colors.statusCancelled.text },
  b20: { background: colors.statusPreparing.bg, ink: colors.statusPreparing.text },
};

export function denominationLook(key: DenominationKey): DenominationLook {
  return BILLS[key] ?? COIN;
}
