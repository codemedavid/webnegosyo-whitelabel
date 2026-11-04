import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { FlagAction, FlagCallout } from "../../../lib/expenses/expense-detail";
import type { ExpenseFlag } from "../../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { Icon, type IconName } from "../../Icon";

interface FlagCalloutsProps {
  callouts: readonly FlagCallout[];
  onAction: (action: FlagAction) => void;
}

const FLAG_ICONS: Record<ExpenseFlag, IconName> = {
  no_receipt: "receipt",
  possible_duplicate: "duplicate",
  round_other: "info",
  after_hours_void: "clock",
};

/** Each "Check these" flag as a sentence, with its fix as a button when there is one. */
export function FlagCallouts({ callouts, onAction }: FlagCalloutsProps) {
  if (callouts.length === 0) return null;
  return (
    <View style={styles.stack}>
      {callouts.map((callout) => (
        <View key={callout.flag} style={styles.callout} testID={`flag-${callout.flag}`}>
          <View style={styles.row}>
            <View style={styles.well}>
              <Icon name={FLAG_ICONS[callout.flag]} size={18} color={colors.accent} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{callout.title}</Text>
              <Text style={styles.body}>{callout.body}</Text>
            </View>
          </View>
          {callout.action ? (
            <Button
              label={callout.action.label}
              tone="secondary"
              size="sm"
              icon={callout.action.kind === "add_receipt" ? "camera" : "arrow-right"}
              onPress={() => callout.action && onAction(callout.action)}
              style={styles.action}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  callout: { backgroundColor: colors.warningLight, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  well: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  body: { ...typography.caption, color: colors.textMuted },
  action: { marginLeft: 36 + spacing.md },
});
