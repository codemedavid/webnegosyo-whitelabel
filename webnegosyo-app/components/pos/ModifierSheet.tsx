import React, { useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import type { ModifierGroup, ModifierOption } from "../../lib/modifier-groups";
import {
  unitPrice,
  validateSelection,
  type PosCartSelection,
} from "../../lib/pos-cart";

interface ModifierSheetProps {
  visible: boolean;
  itemName: string;
  basePrice: number;
  groups: ModifierGroup[];
  onCancel: () => void;
  onConfirm: (selections: PosCartSelection[], quantity: number) => void;
}

function toSelection(group: ModifierGroup, option: ModifierOption): PosCartSelection {
  return {
    groupId: group.id,
    groupName: group.name,
    optionId: option.id,
    optionName: option.name,
    priceModifier: option.price_modifier,
  };
}

/** Options a group starts with — its defaults, clamped to the group's maximum. */
function initialSelections(groups: ModifierGroup[]): PosCartSelection[] {
  return groups.flatMap((group) => {
    const defaults = group.options.filter((o) => o.is_default);
    const limit = group.max_select ?? defaults.length;
    return defaults.slice(0, limit).map((o) => toSelection(group, o));
  });
}

/**
 * Option picker shown before a configurable item joins the cart.
 *
 * Single-select groups (max_select === 1) swap the chosen option; multi-select
 * groups toggle and are blocked at their maximum, so the cashier physically
 * cannot build an invalid line.
 */
export function ModifierSheet({
  visible,
  itemName,
  basePrice,
  groups,
  onCancel,
  onConfirm,
}: ModifierSheetProps) {
  const [selections, setSelections] = useState<PosCartSelection[]>(() =>
    initialSelections(groups),
  );
  const [quantity, setQuantity] = useState(1);

  // Remount-free reset: a new item reuses this sheet, so re-seed when it opens.
  const [seededFor, setSeededFor] = useState(itemName);
  if (visible && seededFor !== itemName) {
    setSeededFor(itemName);
    setSelections(initialSelections(groups));
    setQuantity(1);
  }

  const validation = useMemo(
    () => validateSelection(groups, selections),
    [groups, selections],
  );
  const linePrice = unitPrice(basePrice, selections) * quantity;

  const isChosen = (option: ModifierOption) =>
    selections.some((s) => s.optionId === option.id);

  const toggle = (group: ModifierGroup, option: ModifierOption) => {
    setSelections((current) => {
      const inGroup = current.filter((s) => s.groupId === group.id);
      const others = current.filter((s) => s.groupId !== group.id);

      if (isChosen(option)) {
        // Deselecting below a required minimum is pointless — keep it selected.
        if (inGroup.length <= group.min_select) return current;
        return current.filter((s) => s.optionId !== option.id);
      }

      if (group.max_select === 1) return [...others, toSelection(group, option)];
      if (group.max_select !== null && inGroup.length >= group.max_select) return current;
      return [...current, toSelection(group, option)];
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {itemName}
            </Text>
            <TouchableOpacity onPress={onCancel} hitSlop={12} accessibilityLabel="Close">
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            {groups.map((group) => (
              <View key={group.id} style={styles.group}>
                <Text style={styles.groupName}>
                  {group.name}
                  <Text style={styles.groupRule}>
                    {group.min_select > 0 ? "  Required" : "  Optional"}
                  </Text>
                </Text>

                {group.options.map((option) => {
                  const chosen = isChosen(option);
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.option, chosen && styles.optionChosen]}
                      onPress={() => toggle(group, option)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: chosen }}
                    >
                      <Text style={[styles.optionName, chosen && styles.optionNameChosen]}>
                        {chosen ? "● " : "○ "}
                        {option.name}
                      </Text>
                      {option.price_modifier !== 0 && (
                        <Text style={styles.optionPrice}>
                          {option.price_modifier > 0 ? "+" : ""}
                          {formatPeso(option.price_modifier)}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}

                {validation.errors[group.id] && (
                  <Text style={styles.error}>{validation.errors[group.id]}</Text>
                )}
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepButton}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                accessibilityLabel="Decrease quantity"
              >
                <Text style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.quantity}>{quantity}</Text>
              <TouchableOpacity
                style={styles.stepButton}
                onPress={() => setQuantity((q) => q + 1)}
                accessibilityLabel="Increase quantity"
              >
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.addButton, !validation.valid && styles.addButtonDisabled]}
              disabled={!validation.valid}
              onPress={() => onConfirm(selections, quantity)}
            >
              <Text style={styles.addText}>Add {formatPeso(linePrice)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(29,24,21,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  title: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  close: { fontSize: 20, color: colors.textSecondary, paddingLeft: spacing.md },
  body: { paddingHorizontal: spacing.xl },
  group: { marginTop: spacing.xl },
  groupName: { ...typography.eyebrow, color: colors.textSecondary },
  groupRule: { ...typography.small, color: colors.textTertiary, letterSpacing: 0 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  optionChosen: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  optionName: { ...typography.body, color: colors.textPrimary },
  optionNameChosen: { fontWeight: "700" },
  optionPrice: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.xs },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  stepButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  stepText: { fontSize: 20, color: colors.textPrimary },
  quantity: { ...typography.heading, color: colors.textPrimary, minWidth: 28, textAlign: "center" },
  addButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  addButtonDisabled: { backgroundColor: colors.textTertiary },
  addText: { ...typography.heading, color: colors.textOnDark },
});
