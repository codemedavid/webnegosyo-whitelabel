import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon } from "../Icon";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import { selectionLabel, type PosCartLine } from "../../lib/pos-cart";

interface CartLineRowProps {
  line: PosCartLine;
  /**
   * A tablet's side panel is a narrow column: the stepper moves under the name
   * so the name and the note get the width ("Founder'…" otherwise).
   */
  isPanel: boolean;
  onChangeQty: (key: string, quantity: number) => void;
  /** Opens the line's kitchen note. Absent = the line is read-only. */
  onOpenNote?: (key: string) => void;
}

/** Stepper buttons are drawn at 30pt; the slop makes the target 44pt. */
const STEP_HIT_SLOP = { top: 7, bottom: 7, left: 7, right: 7 };

function noteLabel(line: PosCartLine): string {
  return line.note
    ? `${line.name}, note ${line.note}. Change the note`
    : `${line.name}. Add a note for the kitchen`;
}

/** One line of the running sale: name, options, note, −/+ and its total. */
export function CartLineRow({ line, isPanel, onChangeQty, onOpenNote }: CartLineRowProps) {
  const canEditNote = Boolean(onOpenNote);

  const text = (
    <TouchableOpacity
      style={styles.lineText}
      onPress={onOpenNote ? () => onOpenNote(line.key) : undefined}
      disabled={!canEditNote}
      accessibilityRole={canEditNote ? "button" : undefined}
      accessibilityLabel={canEditNote ? noteLabel(line) : undefined}
    >
      <Text style={styles.lineName} numberOfLines={2}>
        {line.name}
      </Text>
      {line.selections.length > 0 && (
        <Text style={styles.lineMeta} numberOfLines={2}>
          {line.selections.map(selectionLabel).join(", ")}
        </Text>
      )}
      {line.note ? (
        <View style={styles.noteRow}>
          <Icon name="note" size={13} color={colors.accent} />
          <Text style={styles.noteText} numberOfLines={2}>
            {line.note}
          </Text>
        </View>
      ) : canEditNote ? (
        <Text style={styles.addNote}>+ Note</Text>
      ) : null}
    </TouchableOpacity>
  );

  const stepper = (
    <View style={styles.stepper} testID="cart-line-stepper">
      <TouchableOpacity
        style={styles.step}
        onPress={() => onChangeQty(line.key, line.quantity - 1)}
        hitSlop={STEP_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${line.name}`}
      >
        <Text style={styles.stepText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.quantity} accessibilityLabel={`Quantity ${line.quantity}`}>
        {line.quantity}
      </Text>
      <TouchableOpacity
        style={styles.step}
        onPress={() => onChangeQty(line.key, line.quantity + 1)}
        hitSlop={STEP_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${line.name}`}
      >
        <Text style={styles.stepText}>+</Text>
      </TouchableOpacity>
    </View>
  );

  const total = <Text style={styles.lineTotal}>{formatPeso(line.subtotal)}</Text>;

  if (isPanel) {
    return (
      <View style={[styles.line, styles.linePanel]}>
        <View style={styles.panelTop} testID="cart-line-top">
          {text}
          {total}
        </View>
        {stepper}
      </View>
    );
  }

  return (
    <View style={styles.line}>
      {text}
      {stepper}
      {total}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  linePanel: { flexDirection: "column", alignItems: "stretch", gap: spacing.sm },
  panelTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  lineText: { flex: 1 },
  lineName: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  lineMeta: { ...typography.small, color: colors.textSecondary },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  noteText: { ...typography.small, color: colors.accent, fontWeight: "700", flexShrink: 1 },
  addNote: { ...typography.small, color: colors.primary, fontWeight: "600", marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  step: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 17, lineHeight: 20, color: colors.textPrimary },
  quantity: {
    ...typography.body,
    fontWeight: "800",
    minWidth: 24,
    textAlign: "center",
    color: colors.textPrimary,
  },
  lineTotal: {
    ...typography.caption,
    fontWeight: "700",
    minWidth: 68,
    textAlign: "right",
    color: colors.textPrimary,
  },
});
