import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { validateManualItemDiscount, type ManualItemDiscount } from "../../lib/pos-discount";
import type { StaffPermissionHolder } from "../../lib/staff-permissions";
import { Stepper } from "./gov-discount/Stepper";

/** A dish on the sale, as the item discount picker needs it. */
export interface DiscountableLine {
  key: string;
  name: string;
  quantity: number;
}

interface ItemDiscountFormProps {
  lines: readonly DiscountableLine[];
  user: StaffPermissionHolder;
  /** Discounts already on the sale, one per line — shown with a way off. */
  held: readonly ManualItemDiscount[];
  onApply: (discount: ManualItemDiscount) => void;
  onRemove: (lineKey: string) => void;
  /** Keeps the focused field above the keyboard (the sheet scrolls to the end). */
  focusProps: { onFocus: () => void; onBlur: () => void };
}

function describeHeld(discount: ManualItemDiscount, name: string): string {
  const amount = discount.kind === "percent" ? `${discount.value}% off` : `₱${discount.value} off each`;
  return `${name} ×${discount.units} · ${amount} · ${discount.reason}`;
}

/**
 * A cashier's discount on ONE dish: pick the dish, how many of it (1 of 5
 * fries by default), % or ₱ off each, and a reason. Same permission and audit
 * as the whole-order discount — `validateManualItemDiscount` is the gate.
 */
export function ItemDiscountForm({ lines, user, held, onApply, onRemove, focusProps }: ItemDiscountFormProps) {
  const [lineKey, setLineKey] = useState<string | null>(lines[0]?.key ?? null);
  const [units, setUnits] = useState(1);
  const [kind, setKind] = useState<ManualItemDiscount["kind"]>("percent");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = lines.find((line) => line.key === lineKey) ?? null;
  const maxUnits = Math.max(1, Math.floor(selected?.quantity ?? 1));
  const nameOf = (key: string) => lines.find((line) => line.key === key)?.name ?? "Item";

  function pick(key: string) {
    setLineKey(key);
    setUnits(1);
    setError(null);
  }

  function apply() {
    if (!selected) {
      setError("Choose the item to discount.");
      return;
    }
    const discount: ManualItemDiscount = {
      lineKey: selected.key,
      units: Math.min(units, maxUnits),
      kind,
      value: Number(amount),
      reason: reason.trim(),
    };
    const verdict = validateManualItemDiscount(discount, user);
    if (!verdict.isAllowed) {
      setError(verdict.message ?? "That discount cannot be given.");
      return;
    }
    onApply(discount);
    setAmount("");
    setReason("");
    setError(null);
  }

  if (lines.length === 0) {
    return <Text style={styles.hint}>Add an item to the sale first.</Text>;
  }

  return (
    <View style={styles.wrap}>
      {held.map((discount) => (
        <View key={discount.lineKey} style={styles.heldRow}>
          <Text style={styles.heldText} numberOfLines={2}>
            {describeHeld(discount, nameOf(discount.lineKey))}
          </Text>
          <TouchableOpacity
            onPress={() => onRemove(discount.lineKey)}
            accessibilityRole="button"
            accessibilityLabel={`Remove discount on ${nameOf(discount.lineKey)}`}
          >
            <Text style={styles.remove}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}

      <Text style={styles.label}>Which item</Text>
      <View style={styles.chips}>
        {lines.map((line) => (
          <TouchableOpacity
            key={line.key}
            style={[styles.chip, line.key === lineKey && styles.chipActive]}
            onPress={() => pick(line.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: line.key === lineKey }}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {line.name} ×{line.quantity}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {maxUnits > 1 && (
        <View style={styles.unitsRow}>
          <Text style={styles.label}>How many get it (of {maxUnits})</Text>
          <Stepper value={Math.min(units, maxUnits)} min={1} max={maxUnits} onChange={setUnits} label={selected?.name ?? "items"} />
        </View>
      )}

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.kindChip, kind === "percent" && styles.chipActive]}
          onPress={() => setKind("percent")}
          accessibilityRole="button"
          accessibilityState={{ selected: kind === "percent" }}
        >
          <Text style={styles.kindText}>%</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.kindChip, kind === "fixed" && styles.chipActive]}
          onPress={() => setKind("fixed")}
          accessibilityRole="button"
          accessibilityState={{ selected: kind === "fixed" }}
        >
          <Text style={styles.kindText}>₱</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={(next) => {
            setAmount(next);
            setError(null);
          }}
          placeholder={kind === "percent" ? "% off" : "₱ off each"}
          placeholderTextColor={colors.textSecondary}
          keyboardType="decimal-pad"
          accessibilityLabel="Item discount amount"
          {...focusProps}
        />
      </View>
      <TextInput
        style={[styles.input, styles.reason]}
        value={reason}
        onChangeText={(next) => {
          setReason(next);
          setError(null);
        }}
        placeholder="Reason (required)"
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel="Reason for item discount"
        returnKeyType="done"
        {...focusProps}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.apply} onPress={apply} accessibilityRole="button">
        <Text style={styles.applyText}>
          {selected ? `Discount ${Math.min(units, maxUnits)} × ${selected.name}` : "Apply discount"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary },
  hint: { ...typography.caption, color: colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    maxWidth: "100%",
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { ...typography.body, color: colors.textPrimary },
  unitsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  kindChip: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  kindText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reason: { flex: 0 },
  apply: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  applyText: { ...typography.body, fontWeight: "700", color: colors.card },
  heldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  heldText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  remove: { ...typography.caption, fontWeight: "700", color: colors.danger },
  error: { ...typography.caption, color: colors.danger },
});
