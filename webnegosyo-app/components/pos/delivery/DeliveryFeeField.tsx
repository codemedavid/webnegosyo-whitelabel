import React from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Icon } from "../../Icon";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { formatPeso } from "../../../lib/format";
import { formatDistance, type DeliveryFeeSuggestion } from "../../../lib/pos-delivery-quote";

interface DeliveryFeeFieldProps {
  value: string;
  onChange: (next: string) => void;
  error: string | null;
  suggestion: DeliveryFeeSuggestion | null;
  /** The store's road-distance quote is on its way. */
  isCalculating: boolean;
  /** True while the box holds the suggestion rather than a typed figure. */
  isSuggested: boolean;
  onUseSuggestion: () => void;
  /** An address was typed but not pinned on a store that prices by distance. */
  showPinHint: boolean;
}

/**
 * The fee box plus ONE line under it saying where the figure came from — or
 * offering the store's own price when the cashier typed something else. Never
 * more than one line, so the sheet stays calm.
 */
export function DeliveryFeeField({
  value,
  onChange,
  error,
  suggestion,
  isCalculating,
  isSuggested,
  onUseSuggestion,
  showPinHint,
}: DeliveryFeeFieldProps) {
  return (
    <View>
      <View style={[styles.inputRow, error !== null && styles.inputRowInvalid]}>
        <Text style={styles.currency}>₱</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder="0"
          placeholderTextColor={colors.textTertiary}
          keyboardType="decimal-pad"
          accessibilityLabel="Delivery fee"
        />
        {isSuggested && value !== "" && (
          <View style={styles.autoTag}>
            <Text style={styles.autoTagText}>Auto</Text>
          </View>
        )}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FeeNote
          suggestion={suggestion}
          isCalculating={isCalculating}
          isSuggested={isSuggested}
          onUseSuggestion={onUseSuggestion}
          showPinHint={showPinHint}
        />
      )}
    </View>
  );
}

function FeeNote({
  suggestion,
  isCalculating,
  isSuggested,
  onUseSuggestion,
  showPinHint,
}: Pick<
  DeliveryFeeFieldProps,
  "suggestion" | "isCalculating" | "isSuggested" | "onUseSuggestion" | "showPinHint"
>) {
  if (isCalculating) {
    return (
      <View style={styles.noteRow}>
        <ActivityIndicator size="small" color={colors.textSecondary} />
        <Text style={[styles.note, styles.noteInline]}>{"Working out your store's rate…"}</Text>
      </View>
    );
  }

  if (!suggestion) {
    return showPinHint ? (
      <Text style={styles.note}>Pick a suggested address to calculate the fee.</Text>
    ) : (
      <Text style={styles.note}>Type any amount, or leave it empty for no fee.</Text>
    );
  }

  // An estimate says so: it is the offline stand-in, not the store's quote.
  const distance = `${suggestion.isEstimate ? "about " : ""}${formatDistance(suggestion.distanceKm)}`;
  if (!suggestion.isWithinRadius) {
    return (
      <View style={styles.noteRow}>
        <Icon name="warning" size={14} color={colors.warning} strokeWidth={2} />
        <Text style={[styles.note, styles.noteWarning]}>
          {distance} away — outside your {formatDistance(suggestion.radiusKm)} delivery area.
        </Text>
      </View>
    );
  }

  if (isSuggested) {
    return (
      <Text style={styles.note}>
        {suggestion.isFree
          ? `Free delivery — this order reaches your free-delivery minimum (${distance} away).`
          : suggestion.isEstimate
            ? `Estimate for ${distance} by road (offline). Type over it to change.`
            : `Your store's rate for ${distance} by road. Type over it to change.`}
      </Text>
    );
  }

  const label = suggestion.isFree ? "free delivery" : formatPeso(suggestion.fee);
  return (
    <TouchableOpacity
      style={styles.useButton}
      onPress={onUseSuggestion}
      accessibilityRole="button"
      hitSlop={{ top: 6, bottom: 6 }}
    >
      <Text style={styles.useText}>
        {`Use your store's rate: ${label} · ${distance}`}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  inputRowInvalid: { borderColor: colors.danger },
  currency: { ...typography.body, fontWeight: "700", color: colors.textSecondary },
  input: {
    ...typography.body,
    flex: 1,
    fontWeight: "600",
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  autoTag: {
    backgroundColor: colors.successLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  autoTagText: { ...typography.small, fontWeight: "700", color: colors.success },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, flexShrink: 1 },
  noteWarning: { color: colors.textPrimary, marginTop: 0 },
  noteInline: { marginTop: 0 },
  useButton: { alignSelf: "flex-start", marginTop: spacing.xs },
  useText: { ...typography.caption, fontWeight: "700", color: colors.accent },
});
