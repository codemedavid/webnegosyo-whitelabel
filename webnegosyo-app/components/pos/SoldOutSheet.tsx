import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { centeredDialog, useCenteredDialog } from "./dialog-layout";
import type { SoldOutOverride } from "../../lib/use-sold-out-override";

interface SoldOutSheetProps {
  override: SoldOutOverride;
}

export const SOLD_OUT_SUMMARY = "Switched off or out of ingredients.";
export const SELL_UNTIL_END_OF_DAY = "Sell anyway until end of day";

/**
 * What a tap on a greyed "Sold out" tile says. The dish is never added from
 * here; a menu holder may put it back on sale for the rest of the day.
 */
export function SoldOutSheet({ override }: SoldOutSheetProps) {
  const isCentered = useCenteredDialog();
  const { target } = override;
  if (!target) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={override.close}>
      <View style={[styles.backdrop, isCentered && centeredDialog.backdrop]}>
        <View style={[styles.sheet, isCentered && centeredDialog.sheet]} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            {`${target.name.trim() || "This item"} is sold out`}
          </Text>
          <Text style={styles.text}>{SOLD_OUT_SUMMARY}</Text>
          <Text style={styles.reason}>{target.reason}</Text>
          {override.error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {override.error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {override.canSellAnyway ? (
              <Button
                label={SELL_UNTIL_END_OF_DAY}
                onPress={() => void override.sellAnyway()}
                size="lg"
                isLoading={override.isSaving}
              />
            ) : null}
            <Button
              label="OK"
              onPress={override.close}
              tone={override.canSellAnyway ? "ghost" : "primary"}
              size="lg"
              disabled={override.isSaving}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { ...typography.title, color: colors.textPrimary },
  text: { ...typography.body, color: colors.textPrimary },
  reason: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, color: colors.danger },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
