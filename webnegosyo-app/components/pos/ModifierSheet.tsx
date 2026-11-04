import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Modal } from "../Modal";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { centeredDialog, useCenteredDialog } from "./dialog-layout";
import { KitchenNoteField } from "./KitchenNoteField";
import { formatPeso } from "../../lib/format";
import {
  isOptionAvailable,
  unfillableRequiredGroup,
  type ModifierGroup,
  type ModifierOption,
} from "../../lib/modifier-groups";
import { describeStockHint } from "../../lib/pos-stock-hint";
import {
  resolveModifierPrice,
  type OrderTypePricing,
} from "../../lib/order-type-pricing";
import {
  normalizeLineNote,
  unitPrice,
  validateSelection,
  type PosCartSelection,
} from "../../lib/pos-cart";

interface ModifierSheetProps {
  visible: boolean;
  itemName: string;
  /** Already priced for the channel by the caller (`displayPriceForOrderType`). */
  basePrice: number;
  groups: ModifierGroup[];
  /**
   * The sale's order-type pricing. Modifiers are marked up here so the "+₱x"
   * the cashier reads is the figure the cart will charge. Null = store prices.
   */
  pricing?: OrderTypePricing | null;
  /**
   * Option id → units of this dish producible with it (recipe estimate).
   * Shown as a hint only — an estimate never blocks the register.
   */
  optionCeilings?: ReadonlyMap<string, number>;
  onCancel: () => void;
  /** `note` is the trimmed kitchen note, absent when none was written. */
  onConfirm: (selections: PosCartSelection[], quantity: number, note?: string) => void;
}

function toSelection(
  group: ModifierGroup,
  option: ModifierOption,
  pricing: OrderTypePricing | null,
): PosCartSelection {
  return {
    groupId: group.id,
    groupName: group.name,
    optionId: option.id,
    optionName: option.name,
    priceModifier: resolveModifierPrice(option.price_modifier, pricing),
    listPriceModifier: option.price_modifier,
  };
}

/**
 * Options a group starts with — its defaults, clamped to the group's maximum.
 * A sold-out default is skipped: the cashier must never ring up a choice the
 * kitchen switched off just because it was pre-ticked.
 */
function initialSelections(
  groups: ModifierGroup[],
  pricing: OrderTypePricing | null,
): PosCartSelection[] {
  return groups.flatMap((group) => {
    const defaults = group.options.filter((o) => o.is_default && isOptionAvailable(o));
    const limit = group.max_select ?? defaults.length;
    return defaults.slice(0, limit).map((o) => toSelection(group, o, pricing));
  });
}

/**
 * Option picker shown before a configurable item joins the cart.
 *
 * Single-select groups (max_select === 1) swap the chosen option; multi-select
 * groups toggle and are blocked at their maximum, so the cashier physically
 * cannot build an invalid line.
 *
 * A sold-out option (switched off, or simple stock at zero) is listed but
 * cannot be picked; a required group with nothing left refuses the dish.
 */
export function ModifierSheet({
  visible,
  itemName,
  basePrice,
  groups,
  pricing = null,
  optionCeilings,
  onCancel,
  onConfirm,
}: ModifierSheetProps) {
  const [selections, setSelections] = useState<PosCartSelection[]>(() =>
    initialSelections(groups, pricing),
  );
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  // Remount-free reset: a new item reuses this sheet, so re-seed when it opens.
  const [seededFor, setSeededFor] = useState(itemName);
  if (visible && seededFor !== itemName) {
    setSeededFor(itemName);
    setSelections(initialSelections(groups, pricing));
    setQuantity(1);
    setNote("");
  }

  const validation = useMemo(
    () => validateSelection(groups, selections),
    [groups, selections],
  );
  const unfillable = useMemo(() => unfillableRequiredGroup(groups), [groups]);
  const canAdd = validation.valid && unfillable === null;
  const linePrice = unitPrice(basePrice, selections) * quantity;

  const isChosen = (option: ModifierOption) =>
    selections.some((s) => s.optionId === option.id);

  const toggle = (group: ModifierGroup, option: ModifierOption) => {
    if (!isOptionAvailable(option)) return;
    setSelections((current) => {
      const inGroup = current.filter((s) => s.groupId === group.id);
      const others = current.filter((s) => s.groupId !== group.id);

      if (isChosen(option)) {
        // Deselecting below a required minimum is pointless — keep it selected.
        if (inGroup.length <= group.min_select) return current;
        return current.filter((s) => s.optionId !== option.id);
      }

      if (group.max_select === 1) return [...others, toSelection(group, option, pricing)];
      if (group.max_select !== null && inGroup.length >= group.max_select) return current;
      return [...current, toSelection(group, option, pricing)];
    });
  };

  // The note goes along only when one was written, so a caller that never
  // asked for one sees the call it always did.
  const confirm = () => {
    const kitchenNote = normalizeLineNote(note);
    if (kitchenNote) onConfirm(selections, quantity, kitchenNote);
    else onConfirm(selections, quantity);
  };

  // A docked sheet becomes a centred dialog once the glass is a tablet's
  // (components/pos/dialog-layout.ts).
  const isCentered = useCenteredDialog();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={[styles.backdrop, isCentered && centeredDialog.backdrop]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.sheet, isCentered && centeredDialog.sheet]}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {itemName}
            </Text>
            <TouchableOpacity onPress={onCancel} hitSlop={12} accessibilityLabel="Close">
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            {unfillable && (
              <Text style={styles.soldOutNotice}>
                Every {unfillable.name} choice is sold out, so this can&apos;t be added right now.
              </Text>
            )}
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
                  const isSoldOut = !isOptionAvailable(option);
                  const modifier = resolveModifierPrice(option.price_modifier, pricing);
                  const hint = isSoldOut ? null : describeStockHint(optionCeilings?.get(option.id), 0);
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.option,
                        chosen && styles.optionChosen,
                        isSoldOut && styles.optionSoldOut,
                      ]}
                      onPress={() => toggle(group, option)}
                      disabled={isSoldOut}
                      accessibilityRole="button"
                      accessibilityState={{ selected: chosen, disabled: isSoldOut }}
                      accessibilityLabel={isSoldOut ? `${option.name}, sold out` : undefined}
                    >
                      <Text
                        style={[
                          styles.optionName,
                          chosen && styles.optionNameChosen,
                          isSoldOut && styles.optionNameSoldOut,
                        ]}
                      >
                        {chosen ? "● " : "○ "}
                        {option.name}
                      </Text>
                      <View style={styles.optionMeta}>
                        {isSoldOut && <Text style={styles.soldOutLabel}>Sold out</Text>}
                        {hint && (
                          <Text style={[styles.stockHint, hint.isOut && styles.stockHintOut]}>
                            {hint.label}
                          </Text>
                        )}
                        {modifier !== 0 && (
                          <Text style={styles.optionPrice}>
                            {modifier > 0 ? "+" : ""}
                            {formatPeso(modifier)}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {validation.errors[group.id] && (
                  <Text style={styles.error}>{validation.errors[group.id]}</Text>
                )}
              </View>
            ))}
            <View style={styles.note}>
              <KitchenNoteField value={note} onChange={setNote} />
            </View>
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
              style={[styles.addButton, !canAdd && styles.addButtonDisabled]}
              disabled={!canAdd}
              onPress={confirm}
            >
              <Text style={styles.addText}>Add {formatPeso(linePrice)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  optionSoldOut: { backgroundColor: colors.surfaceSubtle, opacity: 0.6 },
  optionNameSoldOut: { color: colors.textTertiary, textDecorationLine: "line-through" },
  optionMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  soldOutLabel: { ...typography.small, color: colors.textSecondary, fontWeight: "700" },
  stockHint: { ...typography.small, color: colors.warning, fontWeight: "600" },
  stockHintOut: { color: colors.danger },
  soldOutNotice: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "600",
    marginTop: spacing.lg,
  },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.xs },
  note: { marginTop: spacing.xl, marginBottom: spacing.lg },
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
