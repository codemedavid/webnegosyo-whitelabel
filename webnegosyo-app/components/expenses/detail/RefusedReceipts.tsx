import React from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import type { ReceiptTile } from "../../../lib/expenses/expense-detail";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { Icon } from "../../Icon";

interface RefusedReceiptsProps {
  tiles: readonly ReceiptTile[];
  onRetry: (receiptId: string) => void;
  onRemove: (receiptId: string) => void;
}

/**
 * Photos the server would not take. They stay on this phone (never dropped
 * silently) until someone tries again or removes them.
 */
export function RefusedReceipts({ tiles, onRetry, onRemove }: RefusedReceiptsProps) {
  const refused = tiles.filter(
    (tile): tile is Extract<ReceiptTile, { kind: "waiting" }> => tile.kind === "waiting" && tile.refusedReason !== null,
  );
  if (refused.length === 0) return null;
  const confirmRemove = (receiptId: string) =>
    Alert.alert("Remove this photo?", "It is only on this phone. Removing it deletes it.", [
      { text: "Keep", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => onRemove(receiptId) },
    ]);
  return (
    <View style={styles.stack}>
      {refused.map((tile) => (
        <View key={tile.key} style={styles.card} testID={`refused-receipt-${tile.key}`}>
          <View style={styles.row}>
            <Icon name="photo" size={18} color={colors.danger} />
            <View style={styles.copy}>
              <Text style={styles.title}>{"A photo didn't upload"}</Text>
              <Text style={styles.body}>{tile.refusedReason}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Button label="Try again" size="sm" onPress={() => onRetry(tile.key)} fullWidth={false} />
            <Button label="Remove" tone="ghost" size="sm" onPress={() => confirmRemove(tile.key)} fullWidth={false} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  card: { backgroundColor: colors.dangerLight, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  body: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: "row", gap: spacing.sm },
});
