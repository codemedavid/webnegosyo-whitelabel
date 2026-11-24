/**
 * "Paid, method not picked" — name how a paid sale came in.
 *
 * Before 2026-11-24, handing over a pay-later sale marked it paid with no
 * method, so Sales filed it under "Paid, method not picked" and cash + GCash
 * never added up (Koko Coffee: ₱1,610 in November). This card lets the owner
 * file each one under its real method. It changes no amount and records no new
 * payment — the money was already counted; only its label is fixed.
 *
 * Whether to show it is `canNameOrderMethod` (lib/order-method-naming.ts).
 */

import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { formatPeso } from "../../lib/format";
import type { CollectPaymentMethod } from "./CollectPaymentSheet";

interface NameMethodCardProps {
  amount: number;
  methods: readonly CollectPaymentMethod[];
  onSave: (method: CollectPaymentMethod) => Promise<void>;
}

export function NameMethodCard({ amount, methods, onSave }: NameMethodCardProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = methods.find((method) => method.id === pickedId) ?? null;

  async function save() {
    if (!picked || isSaving) {
      if (!picked) setError("Tap how the customer paid.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(picked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.card} accessibilityLabel="Payment method not picked">
      <Text style={styles.title}>Paid, method not picked</Text>
      <Text style={styles.detail}>
        Tap how {formatPeso(amount)} was paid so Sales and the drawer file it under the right method.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          {methods.map((method) => {
            const isActive = method.id === pickedId;
            return (
              <TouchableOpacity
                key={method.id}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => {
                  setPickedId(method.id);
                  setError(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{method.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={[styles.save, (isSaving || !picked) && styles.saveDisabled]}
        onPress={() => void save()}
        disabled={isSaving}
        accessibilityRole="button"
      >
        <Text style={styles.saveText}>{isSaving ? "Saving..." : picked ? `Paid by ${picked.name}` : "Save"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textSecondary },
  row: { flexDirection: "row", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.background,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { ...typography.body, color: colors.textPrimary },
  chipTextActive: { color: colors.textOnDark },
  error: { ...typography.caption, color: colors.danger },
  save: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  saveDisabled: { opacity: 0.5 },
  saveText: { ...typography.body, fontWeight: "700", color: colors.textOnDark },
});
