import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { centeredDialog, useCenteredDialog } from "./dialog-layout";
import type { StockQuestion } from "../../lib/pos-stock-decision";

interface StockShortSheetProps {
  /** The question to ask; null = closed. */
  question: StockQuestion | null;
  /** "Sell 5" — sell what the count covers. */
  onSellWithin: () => void;
  /** "Sell anyway" — only called when the question allows it. */
  onSellAnyway: () => void;
  onCancel: () => void;
}

/**
 * The register's "Only 5 left" question (replaces a plain alert): what the
 * sale asks for, what the stock count covers, and the three ways out —
 * sell what's in stock, sell anyway, or cancel. Every word and which buttons
 * show come from `pos-stock-decision.ts`; this only draws them.
 *
 * On a `block` store a cashier's "Sell anyway" is shown disabled with the
 * reason under it, so the rule is visible rather than a button that does
 * nothing.
 */
export function StockShortSheet({ question, onSellWithin, onSellAnyway, onCancel }: StockShortSheetProps) {
  const isCentered = useCenteredDialog();
  if (!question) return null;

  const needsManager = question.sellAnyway.mode === "needs_manager";
  const hasList = question.lines.length > 1;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.backdrop, isCentered && centeredDialog.backdrop]}>
        <View style={[styles.sheet, isCentered && centeredDialog.sheet]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.header}>
              <View style={styles.iconWrap}>
                <Icon name="warning" size={20} color={colors.warning} />
              </View>
              <Text style={styles.title} accessibilityRole="header">
                {question.title}
              </Text>
            </View>

            <Text style={styles.text}>{question.body}</Text>

            {hasList ? (
              <View style={styles.list}>
                {question.lines.map((line) => (
                  <Text key={line} style={styles.listItem}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}

            {question.offlineNote ? <Text style={styles.note}>{question.offlineNote}</Text> : null}

            <View style={styles.actions}>
              {question.sellWithin ? (
                <Button label={question.sellWithin.label} onPress={onSellWithin} size="lg" />
              ) : null}
              <Button
                label={question.sellAnyway.label}
                onPress={onSellAnyway}
                tone={question.sellWithin ? "secondary" : "primary"}
                size="lg"
                disabled={needsManager}
                accessibilityHint={needsManager ? question.managerNote ?? undefined : undefined}
              />
              {question.managerNote ? <Text style={styles.managerNote}>{question.managerNote}</Text> : null}
              <Button label="Cancel" onPress={onCancel} tone="ghost" size="lg" />
            </View>
          </ScrollView>
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
    maxHeight: "92%",
  },
  body: { gap: spacing.md, paddingBottom: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.warningLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...typography.title, color: colors.textPrimary, flex: 1 },
  text: { ...typography.body, color: colors.textPrimary },
  list: { gap: spacing.xs, backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, padding: spacing.md },
  listItem: { ...typography.body, color: colors.textPrimary },
  note: { ...typography.caption, color: colors.textMuted },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  managerNote: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
});
