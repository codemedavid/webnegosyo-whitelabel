import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  EMPTY_MOVEMENT_DRAFT,
  MANUAL_MOVEMENT_REASONS,
  MOVEMENT_REASON_LABELS,
  MOVEMENT_REASON_PROMPTS,
  buildMovementPayload,
  bumpQuantity,
  describeMovementOutcome,
  isOvercountedWaste,
  type ManualMovementReason,
  type MovementDraft,
} from "../lib/inventory-movement";
import { submitStockMovement } from "../lib/inventory-movement-service";
import { newLocalOrderId } from "../lib/offline/local-id";
import { formatStockQuantity, type StockItemView } from "../lib/inventory-stock";
import { colors, typography, spacing, radius } from "../theme/colors";
import { Icon, type IconName } from "./Icon";

/** Chips under the amount for a delivery or waste; a count is typed exactly. */
const QUICK_STEPS: readonly number[] = [1, 5, 10];

/** The button says what will happen, not the past-tense ledger label. */
const SAVE_LABELS: Record<ManualMovementReason, string> = {
  receive: "Add to stock",
  stocktake: "Save count",
  waste: "Record waste",
};

const REASON_LOOK: Record<ManualMovementReason, { icon: IconName; ink: string; tint: string }> = {
  receive: { icon: "arrow-down", ink: colors.success, tint: colors.successLight },
  stocktake: { icon: "check", ink: colors.info, tint: colors.infoLight },
  waste: { icon: "trash", ink: colors.danger, tint: colors.dangerLight },
};

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
  /** Which tab the sheet opens on — set by the shortcut that opened it. */
  initialReason?: ManualMovementReason;
  onClose: () => void;
  /** Fired once the ledger has settled, so the shelf reloads from the server. */
  onRecorded: () => void;
}

/**
 * Recording a delivery, a count or waste from the phone.
 *
 * Every judgement lives in lib/inventory-movement.ts; this arranges them. The
 * before → after card is the reason this is a sheet rather than a bare input —
 * a merchant tapping through quickly should see "12 kg → 112 kg" before they
 * commit, because the ledger is the source of truth for stock and a typo here
 * is not a wrong screen, it is a wrong shelf until someone counts it again.
 */
export function StockMovementSheet({
  tenantId,
  item,
  outletId,
  openCountId,
  initialReason,
  onClose,
  onRecorded,
}: StockMovementSheetProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<MovementDraft>(EMPTY_MOVEMENT_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per thing the merchant means to record. Tapping Save again after a
  // timeout reuses it, so the server records that delivery once; changing what
  // was typed is a new intent and gets a new key.
  const requestIdRef = useRef<string | null>(null);
  useEffect(() => {
    requestIdRef.current = null;
  }, [draft, item?.id]);

  // Opening on a shortcut's reason; reopening always starts clean.
  const itemId = item?.id;
  useEffect(() => {
    if (itemId) setDraft({ ...EMPTY_MOVEMENT_DRAFT, reason: initialReason ?? "receive" });
  }, [itemId, initialReason]);

  const outcome = useMemo(
    () => (item ? describeMovementOutcome(draft.reason, draft.quantity, item) : null),
    [item, draft.reason, draft.quantity],
  );
  const overcounted = item ? isOvercountedWaste(draft.reason, draft.quantity, item) : false;
  const look = REASON_LOOK[draft.reason];

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
      requestIdRef.current ??= newLocalOrderId();
      await submitStockMovement(tenantId, payload, outletId, {
        clientRequestId: requestIdRef.current,
      });
      close();
      onRecorded();
    } catch (submitError) {
      // Surfaced, never swallowed: the merchant is watching and a false
      // confirmation would only be discovered at the next stocktake.
      setError(submitError instanceof Error ? submitError.message : "That did not save.");
      setIsSaving(false);
    }
  };

  const unit = item?.unitAbbreviation ?? "";

  return (
    <Modal visible={item !== null} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity style={styles.backdropFill} onPress={close} activeOpacity={1} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.grabber} />

            <View style={styles.header}>
              <View style={[styles.headerBadge, { backgroundColor: look.tint }]}>
                <Icon name={look.icon} size={20} color={look.ink} strokeWidth={2} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.title} numberOfLines={1}>
                  {item?.name}
                </Text>
                <Text style={styles.subtitle}>
                  {item ? `${formatStockQuantity(item.quantity, unit)} on hand` : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={close} style={styles.closeButton} accessibilityLabel="Close">
                <Icon name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

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
                    <Icon
                      name={REASON_LOOK[reason].icon}
                      size={16}
                      color={isActive ? colors.heroInkText : colors.textSecondary}
                      strokeWidth={2}
                    />
                    <Text style={[styles.reasonText, isActive && styles.reasonTextActive]}>
                      {MOVEMENT_REASON_LABELS[reason]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.amountCard}>
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
                  selectTextOnFocus
                />
                {unit ? (
                  <View style={styles.unitPill}>
                    <Text style={styles.unitText}>{unit}</Text>
                  </View>
                ) : null}
              </View>

              {draft.reason !== "stocktake" && (
                <View style={styles.steps}>
                  {QUICK_STEPS.map((step) => (
                    <TouchableOpacity
                      key={step}
                      style={styles.step}
                      onPress={() => setDraft((c) => ({ ...c, quantity: bumpQuantity(c.quantity, step) }))}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${step}`}
                    >
                      <Text style={styles.stepText}>+{step}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {outcome && (
              <View style={styles.preview}>
                <View style={styles.previewSide}>
                  <Text style={styles.previewLabel}>Now</Text>
                  <Text style={styles.previewFrom}>{outcome.from}</Text>
                </View>
                <Icon name="arrow-right" size={18} color={colors.textTertiary} />
                <View style={[styles.previewSide, styles.previewSideEnd]}>
                  <Text style={styles.previewLabel}>After</Text>
                  <Text style={[styles.previewTo, { color: look.ink }]}>{outcome.to}</Text>
                </View>
              </View>
            )}

            {overcounted && (
              <View style={styles.warning}>
                <Icon name="warning" size={16} color={colors.statusPending.text} />
                <Text style={styles.warningText}>
                  That is more than the shelf shows. Record it if it is right — stock can go
                  negative when a delivery has not been logged yet.
                </Text>
              </View>
            )}

            {draft.reason === "receive" && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Price per {unit || "unit"} (optional)</Text>
                <View style={styles.fieldInputRow}>
                  <Text style={styles.fieldPrefix}>₱</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={draft.unitCost ?? ""}
                    onChangeText={(unitCost) => setDraft((c) => ({ ...c, unitCost }))}
                    placeholder="Keeps the current cost if blank"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Note</Text>
              <TextInput
                style={styles.note}
                value={draft.note}
                onChangeText={(note) => setDraft((c) => ({ ...c, note }))}
                placeholder={draft.reason === "waste" ? "What happened? (optional)" : "Optional"}
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.error}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.save, isSaving && styles.saveDisabled]}
              onPress={save}
              disabled={isSaving}
              accessibilityRole="button"
            >
              {isSaving ? (
                <ActivityIndicator color={colors.heroInkText} />
              ) : (
                <Text style={styles.saveText}>{SAVE_LABELS[draft.reason]}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,14,8,0.5)" },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    maxHeight: "92%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    marginBottom: spacing.lg,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerBadge: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.2, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },

  reasons: {
    flexDirection: "row",
    gap: 4,
    marginTop: spacing.lg,
    padding: 4,
    borderRadius: radius.md + 4,
    backgroundColor: colors.primaryLight,
  },
  reason: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  reasonActive: { backgroundColor: colors.heroInk },
  reasonText: { fontSize: 13, color: colors.textSecondary, fontWeight: "700" },
  reasonTextActive: { color: colors.heroInkText },

  amountCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  amountRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  amountInput: {
    flex: 1,
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: -1,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
  },
  unitPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  unitText: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  steps: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  step: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },

  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  previewSide: { flex: 1 },
  previewSideEnd: { alignItems: "flex-end" },
  previewLabel: { ...typography.eyebrow, fontSize: 10, color: colors.textTertiary },
  previewFrom: { fontSize: 17, fontWeight: "700", color: colors.textSecondary, marginTop: 2 },
  previewTo: { fontSize: 17, fontWeight: "800", marginTop: 2 },

  warning: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  warningText: { flex: 1, ...typography.caption, color: colors.statusPending.text, lineHeight: 18 },

  field: { marginTop: spacing.lg, gap: 6 },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  fieldInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.lg,
    height: 48,
    gap: 6,
  },
  fieldPrefix: { fontSize: 16, fontWeight: "700", color: colors.textSecondary },
  fieldInput: { flex: 1, ...typography.body, color: colors.textPrimary },
  note: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerLight,
  },
  error: { ...typography.caption, color: colors.statusCancelled.text, fontWeight: "600" },

  save: {
    backgroundColor: colors.heroInk,
    borderRadius: radius.lg,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  saveDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, color: colors.heroInkText, fontWeight: "800" },
});
