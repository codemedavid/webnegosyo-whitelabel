import { colors } from "../../theme/colors";
import type { StockLevel } from "../../lib/inventory-stock";

/**
 * One palette for a stock level, shared by every inventory surface so the ring,
 * the rows, the chips and the detail gauge can never disagree about which
 * colour "low" is.
 */
export interface LevelStyle {
  label: string;
  /** Solid mark: bar fill, ring segment, dot. */
  fill: string;
  /** Text on the tinted chip. */
  text: string;
  /** Chip / monogram background. */
  tint: string;
}

export const LEVEL_STYLE: Record<StockLevel, LevelStyle> = {
  out: { label: "Out", fill: colors.danger, text: colors.statusCancelled.text, tint: colors.dangerLight },
  low: { label: "Low", fill: colors.warning, text: colors.statusPending.text, tint: colors.warningLight },
  ok: { label: "Stocked", fill: colors.success, text: colors.statusReady.text, tint: colors.successLight },
};
