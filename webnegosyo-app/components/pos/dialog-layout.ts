import { StyleSheet, useWindowDimensions } from "react-native";
import { radius, spacing } from "../../theme/colors";
import { POS_DIALOG_MAX_WIDTH, isPosDialogCentered } from "../../lib/pos-layout";

/**
 * Shared by every register modal: the modifier picker, discounts, delivery
 * details and the customer picker all draw the same bottom sheet, so they all
 * stretch the same way on a tablet and are corrected the same way here.
 *
 * On a phone these styles are never applied and the sheets are exactly what
 * they were.
 */

/** True when this window is wide enough that a docked sheet reads badly. */
export function useCenteredDialog(): boolean {
  const { width, height } = useWindowDimensions();
  return isPosDialogCentered({ width, height });
}

export const centeredDialog = StyleSheet.create({
  /** Applied over the sheet's own `backdrop` style. */
  backdrop: {
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  /**
   * Applied over the sheet's own `sheet` style. All four corners are named
   * because a `borderRadius` shorthand does not override the two specific
   * `borderTop*Radius` values the docked sheets set.
   */
  sheet: {
    width: "100%",
    maxWidth: POS_DIALOG_MAX_WIDTH,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
});
