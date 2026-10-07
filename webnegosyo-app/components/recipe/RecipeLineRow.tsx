import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Icon } from "../Icon";
import { formatRecipeQuantity, parseQuantityDraft } from "../../lib/recipe-editor";
import type { RecipeComponentView } from "../../lib/recipe-service";

interface RecipeLineRowProps {
  line: RecipeComponentView;
  /** Blocks edits while another save is in flight. */
  disabled?: boolean;
  /** Focus the amount on mount — set for the line the merchant just added. */
  autoFocus?: boolean;
  onFocus?: () => void;
  onCommitQuantity: (quantity: number) => void;
  onOpenUnits: () => void;
  onRemove: () => void;
}

/**
 * One ingredient on a recipe: its name, then "how much" as a single field —
 * the amount and its unit read together ("0.25 | L ▾") the way a recipe card
 * writes them, instead of a box beside a scrolling strip of every unit.
 *
 * The amount saves when editing ends, and only when it actually changed. A
 * refused amount stays in the box with the reason under it, so the merchant
 * fixes what they typed rather than retyping it after an alert.
 *
 * The parent keys this row by its saved quantity and unit, so a successful
 * save remounts it with the stored value — no effect syncing a draft.
 */
export function RecipeLineRow({
  line,
  disabled,
  autoFocus,
  onFocus,
  onCommitQuantity,
  onOpenUnits,
  onRemove,
}: RecipeLineRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = line.ingredientName || "Ingredient";
  const unitLabel = line.unitLabel || "unit";

  const commit = () => {
    if (draft === null) return;
    const parsed = parseQuantityDraft(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    if (parsed.value === line.quantity) {
      setDraft(null);
      return;
    }
    onCommitQuantity(parsed.value);
  };

  return (
    <View style={styles.row}>
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>

        <View style={[styles.field, error !== null && styles.fieldError]}>
          <TextInput
            style={styles.amount}
            value={draft ?? formatRecipeQuantity(line.quantity)}
            onChangeText={(text) => {
              setDraft(text);
              if (error !== null) setError(null);
            }}
            // End-editing also fires after "done", so this alone saves once.
            onEndEditing={commit}
            onFocus={onFocus}
            autoFocus={autoFocus}
            selectTextOnFocus
            keyboardType="decimal-pad"
            returnKeyType="done"
            editable={!disabled}
            accessibilityLabel={`Amount of ${name} per sale`}
          />
          <TouchableOpacity
            style={styles.unit}
            onPress={onOpenUnits}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Unit for ${name}: ${unitLabel}`}
          >
            <Text style={styles.unitText} numberOfLines={1}>
              {unitLabel}
            </Text>
            <View style={styles.caret}>
              <Icon name="chevron" size={12} color={colors.textSecondary} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.remove}
        onPress={onRemove}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${name}`}
      >
        <Icon name="trash" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      {error !== null && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const FIELD_HEIGHT = 44;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  field: {
    flexDirection: "row",
    alignItems: "stretch",
    height: FIELD_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surfaceSubtle,
    overflow: "hidden",
  },
  fieldError: { borderColor: colors.danger },
  amount: {
    width: 72,
    paddingHorizontal: spacing.sm,
    textAlign: "right",
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: colors.textPrimary,
  },
  unit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 56,
    maxWidth: 88,
    paddingHorizontal: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.separator,
    backgroundColor: colors.card,
  },
  unitText: { flexShrink: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  // The icon set has one chevron, pointing right; a quarter turn reads "opens a list".
  caret: { transform: [{ rotate: "90deg" }] },
  remove: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { ...typography.caption, color: colors.danger, width: "100%", textAlign: "right", marginTop: -4 },
});
