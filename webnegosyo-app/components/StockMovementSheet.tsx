import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import {
  EMPTY_MOVEMENT_DRAFT,
  MANUAL_MOVEMENT_REASONS,
  MOVEMENT_REASON_LABELS,
  MOVEMENT_REASON_PROMPTS,
  buildMovementPayload,
  describeMovementOutcome,
  isOvercountedWaste,
  type ManualMovementReason,
  type MovementDraft,
} from "../lib/inventory-movement";
import { submitStockMovement } from "../lib/inventory-movement-service";
import type { StockItemView } from "../lib/inventory-stock";
import { colors, typography, spacing, radius } from "../theme/colors";

interface StockMovementSheetProps {
  tenantId: string;
  item: StockItemView | null;
  /**
   * The branch whose shelf is on screen, passed down rather than resolved here
   * so the write cannot target a different shelf from the one the merchant is
   * reading. Undefined for a single-shop tenant, or an owner looking at the
   * whole store.
   */
  outletId?: string | null;
  /**
   * The count session running on this shelf, if there is one. Passed down so a
   * count entered here is filed under it AUTOMATICALLY — a tag the merchant had
   * to remember would be forgotten, and a forgotten tag does not lose a figure,
   * it leaves an honest count reading as partial.
   */
  openCountId?: string | null;
  onClose: () => void;
  /** Fired once the ledger has settled, so the shelf reloads from the server. */
  onRecorded: () => void;
}

/**
 * Recording a delivery, a count or waste from the phone.
 *
 * Every judgement lives in lib/inventory-movement.ts; this arranges them. The
 * preview line is the reason this is a sheet rather than a bare input — a
 * merchant tapping through quickly should see "12 kg → 112 kg" before they
 * commit, because the ledger is the source of truth for stock and a typo here
 * is not a wrong screen, it is a wrong shelf until someone counts it again.
 */
export function StockMovementSheet({
  tenantId,
  item,
  outletId,
  openCountId,
  onClose,
  onRecorded,
}: StockMovementSheetProps) {
  const [draft, setDraft] = useState<MovementDraft>(EMPTY_MOVEMENT_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcome = useMemo(
    () => (item ? describeMovementOutcome(draft.reason, draft.quantity, item) : null),
    [item, draft.reason, draft.quantity],
  );
  const overcounted = item ? isOvercountedWaste(draft.reason, draft.quantity, item) : false;

  const close = () => {
    // Reset here rather than on open: a sheet that reopens holding the last
    // delivery invites recording it twice.
    setDraft(EMPTY_MOVEMENT_DRAFT);
    setError(null);
    setIsSaving(false);
    onClose();
  };

  const setReason = (reason: ManualMovementReason) =>
    setDraft((current) => ({ ...current, reason }));

  const save = async () => {
    if (!item || isSaving) return;
    setError(null);

    let payload;
    try {
      payload = buildMovementPayload(draft, item, openCountId);
    } catch (validationError) {
      setError(
        validationError instanceof Error ? validationError.message : "Check the amount",
      );
      return;
    }

    setIsSaving(true);
    try {
      await submitStockMovement(tenantId, payload, outletId);
      close();
      onRecorded();
    } catch (submitError) {
      // Surfaced, never swallowed: the merchant is watching and a false
      // confirmation would only be discovered at the next stocktake.
      setError(submitError instanceof Error ? submitError.message : "That did not save.");
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={item !== null}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity style={styles.backdropFill} onPress={close} activeOpacity={1} />

        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.grabber} />
            <Text style={styles.title}>{item?.name}</Text>
            <Text style={styles.subtitle}>
              {item ? `${item.quantity} ${item.unitAbbreviation} on hand` : ""}
            </Text>

            <View style={styles.reasons}>
              {MANUAL_MOVEMENT_REASONS.map((reason) => {
                const isActive = draft.reason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reason, isActive && styles.reasonActive]}
                    onPress={() => setReason(reason)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[styles.reasonText, isActive && styles.reasonTextActive]}>
                      {MOVEMENT_REASON_LABELS[reason]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>{MOVEMENT_REASON_PROMPTS[draft.reason]}</Text>
            <View style={styles.amountRow}>
              <TextInput
                style={styles.amountInput}
                value={draft.quantity}
                onChangeText={(quantity) => setDraft((c) => ({ ...c, quantity }))}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={styles.unit}>{item?.unitAbbreviation}</Text>
            </View>

            {outcome && (
              <Text style={styles.preview}>
                {outcome.from} → <Text style={styles.previewTo}>{outcome.to}</Text>
              </Text>
            )}

            {overcounted && (
              <Text style={styles.warning}>
                That is more than the shelf shows. Record it if it is right — stock can go
                negative when a delivery has not been logged yet.
              </Text>
            )}

            <TextInput
              style={styles.note}
              value={draft.note}
              onChangeText={(note) => setDraft((c) => ({ ...c, note }))}
              placeholder="Note (optional)"
              placeholderTextColor={colors.textTertiary}
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={[styles.save, isSaving && styles.saveDisabled]}
              onPress={save}
              disabled={isSaving}
              accessibilityRole="button"
            >
              {isSaving ? (
                <ActivityIndicator color={colors.heroInkText} />
              ) : (
                <Text style={styles.saveText}>Record {MOVEMENT_REASON_LABELS[draft.reason]}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={close} accessibilityRole="button">
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    marginBottom: spacing.lg,
  },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  reasons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  reason: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
  },
  reasonActive: { backgroundColor: colors.heroInk, borderColor: colors.heroInk },
  reasonText: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  reasonTextActive: { color: colors.heroInkText },

  label: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.lg },
  amountRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: "800",
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  unit: { ...typography.body, color: colors.textSecondary },

  preview: { ...typography.body, color: colors.textSecondary },
  previewTo: { fontWeight: "800", color: colors.textPrimary },
  warning: { ...typography.caption, color: colors.warning, marginTop: spacing.sm },

  note: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 46,
    marginTop: spacing.lg,
  },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },

  save: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  saveDisabled: { opacity: 0.6 },
  saveText: { ...typography.body, color: colors.heroInkText, fontWeight: "700" },
  cancel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
