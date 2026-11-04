import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { changeSentence, diffCashRules, REMITTANCE_MODE_OPTIONS, rulesPatch, stepThreshold } from "../../lib/cash/rules-form";
import type { CashSettings, CashSettingsPatch } from "../../lib/cash/settings";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { SegmentedControl } from "../SegmentedControl";
import { Stepper } from "./Stepper";

export type SaveRulesResult = { ok: true } | { ok: false; error: string };

interface CashRulesFormProps {
  settings: CashSettings;
  /** False in demo, offline, or for a viewer who may only read. */
  canEdit: boolean;
  isOffline: boolean;
  /**
   * The store's orders live on the platform database. Elsewhere (Convex, the
   * store's own database) the server cannot hide totals, so blind count only
   * hides them on the register screens — and the copy says so.
   */
  isPlatformStore: boolean;
  onSave: (patch: CashSettingsPatch) => Promise<SaveRulesResult>;
  /** Rendered between the rules and the save dock (Shifts, Who can receive cash). */
  children?: React.ReactNode;
}

const COUNT_OPTIONS = [
  { label: "Optional", value: false },
  { label: "Required", value: true },
] as const;

const pesos = (cents: number): string => `₱${(cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

/**
 * Counting, Short & over, Remittances and Selling (06 §4.6). The save dock
 * appears only when something changed and lists each change before it is
 * sent, the way Approval rules does.
 */
export const BLIND_COUNT_OFF_PLATFORM_NOTE =
  "Your orders are not on the WebNegosyo database, so this only hides totals on the register screens. Cashiers can still read orders elsewhere in the app.";

export function CashRulesForm({ settings, canEdit, isOffline, isPlatformStore, onSave, children }: CashRulesFormProps) {
  const [draft, setDraft] = useState<CashSettings>(settings);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLines, setSavedLines] = useState<string[] | null>(null);

  // A fresh read from the server (after a save, or another device's) replaces the draft.
  useEffect(() => setDraft(settings), [settings]);

  const changes = diffCashRules(settings, draft);
  const isLocked = !canEdit || isSaving;
  const edit = (patch: Partial<CashSettings>) => {
    setSavedLines(null);
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await onSave(rulesPatch(settings, draft));
    setSaving(false);
    if (result.ok) setSavedLines(changes.map(changeSentence));
    else setError(result.error);
  };

  const remitHint = REMITTANCE_MODE_OPTIONS.find((option) => option.value === draft.remittanceMode)?.hint;

  return (
    <>
      {savedLines ? (
        <View style={styles.saved} accessibilityRole="alert">
          <Icon name="check" size={18} color={colors.statusReady.text} />
          <View style={styles.savedCopy}>
            <Text style={styles.savedTitle}>Rules saved</Text>
            {savedLines.map((line) => (
              <Text key={line} style={styles.savedLine}>
                {line}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.heading} accessibilityRole="header">
          Counting
        </Text>
        <Text style={styles.label}>Count bills at end of shift</Text>
        <SegmentedControl
          options={COUNT_OPTIONS}
          value={draft.requireDenominations}
          onChange={(value) => !isLocked && edit({ requireDenominations: value })}
          accessibilityPrefix="Count bills at end of shift"
        />
        <View style={[styles.switchRow, styles.divider]}>
          <View style={styles.switchCopy}>
            <Text style={styles.label}>Blind count</Text>
            <Text style={styles.hint}>Hide expected cash from cashiers until they count. Recommended.</Text>
            {isPlatformStore ? null : <Text style={styles.hint}>{BLIND_COUNT_OFF_PLATFORM_NOTE}</Text>}
          </View>
          <Switch
            value={draft.blindClose}
            onValueChange={(value) => edit({ blindClose: value })}
            disabled={isLocked}
            trackColor={{ true: colors.accent, false: colors.separator }}
            accessibilityLabel="Blind count"
          />
        </View>
        {draft.blindClose && !settings.blindClose ? (
          <View style={styles.warning}>
            <Icon name="warning" size={16} color={colors.statusPending.text} />
            <Text style={styles.warningText}>
              Update the app on every register first. An older register still shows the expected cash.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.heading} accessibilityRole="header">
          Short & over
        </Text>
        <Stepper
          label="Ask for a reason above"
          hint="Short or over by more than this"
          value={pesos(draft.varianceReasonFromCents)}
          onDecrease={() => edit({ varianceReasonFromCents: stepThreshold(draft.varianceReasonFromCents, -1) })}
          onIncrease={() => edit({ varianceReasonFromCents: stepThreshold(draft.varianceReasonFromCents, 1) })}
          decreaseLabel="Lower the reason threshold by 10 pesos"
          increaseLabel="Raise the reason threshold by 10 pesos"
          disabled={isLocked}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.heading} accessibilityRole="header">
          Remittances
        </Text>
        <SegmentedControl
          options={REMITTANCE_MODE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
          value={draft.remittanceMode}
          onChange={(value) => !isLocked && edit({ remittanceMode: value })}
          accessibilityPrefix="Remittances"
        />
        {remitHint ? <Text style={styles.hint}>{remitHint}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.heading} accessibilityRole="header">
          Selling
        </Text>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.label}>Require a shift to sell</Text>
            <Text style={styles.hint}>The first sale asks the cashier to start one.</Text>
          </View>
          <Switch
            value={draft.requireShiftToSell}
            onValueChange={(value) => edit({ requireShiftToSell: value })}
            disabled={isLocked}
            trackColor={{ true: colors.accent, false: colors.separator }}
            accessibilityLabel="Require a shift to sell"
          />
        </View>
      </View>

      {children}

      {changes.length > 0 ? (
        <View style={styles.dock}>
          {changes.map((change) => (
            <Text key={change.key} style={styles.change}>
              {changeSentence(change)}
            </Text>
          ))}
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {isOffline ? <Text style={styles.hint}>{"You're offline. Connect to save."}</Text> : null}
          <Button label="Save changes" size="lg" onPress={() => void save()} isLoading={isSaving} disabled={isOffline || !canEdit} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  heading: { ...typography.heading, color: colors.textPrimary },
  label: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  hint: { ...typography.caption, color: colors.textMuted },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 62 },
  divider: { borderTopWidth: 1, borderTopColor: colors.separator, marginTop: spacing.sm, paddingTop: spacing.sm },
  switchCopy: { flex: 1, gap: 2 },
  warning: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  warningText: { ...typography.caption, color: colors.statusPending.text, flex: 1 },
  saved: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.successLight },
  savedCopy: { flex: 1, gap: 2 },
  savedTitle: { ...typography.body, fontWeight: "700", color: colors.statusReady.text },
  savedLine: { ...typography.caption, color: colors.statusReady.text },
  dock: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  change: { ...typography.caption, color: colors.textPrimary },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
});
