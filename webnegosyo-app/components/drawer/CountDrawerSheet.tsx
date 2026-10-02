import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { judgeCount, parseCashInput, validateCashAmount } from "../../lib/shift";
import { formatPeso } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { CashInput, DrawerSheet, sheetText } from "./DrawerSheet";

export interface CountTarget {
  title: string;
  subtitle: string;
  /** Null while the expectation cannot be computed — Confirm is then refused. */
  expectedInDrawer: number | null;
  floatToKeep: number;
  isZeroBalance: boolean;
  /** Why the drawer cannot be reconciled right now, said in place of the figures. */
  blockedReason: string | null;
}

interface CountDrawerSheetProps {
  target: CountTarget | null;
  isBusy: boolean;
  onConfirm: (counted: number) => void;
  onClose: () => void;
}

const VERDICT_TONE = {
  balanced: { bg: colors.successLight, fg: colors.success, label: "Balanced" },
  short: { bg: colors.dangerLight, fg: colors.danger, label: "Short" },
  over: { bg: colors.warningLight, fg: colors.statusPending.text, label: "Over" },
} as const;

/**
 * Counting the drawer at close — the cashier's own, or a manager closing a
 * cashier's. The verdict is shown live as the count is typed, so a ₱100 slip
 * is noticed (and recounted) BEFORE the shift is closed on it.
 */
export function CountDrawerSheet({ target, isBusy, onConfirm, onClose }: CountDrawerSheetProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setText("");
    setError(null);
    onClose();
  };

  if (!target) return null;

  const counted = text.trim() ? parseCashInput(text) : null;
  const countVerdict = counted === null ? null : validateCashAmount(counted);
  const judgement =
    countVerdict?.ok && target.expectedInDrawer !== null
      ? judgeCount(target.expectedInDrawer, target.floatToKeep, countVerdict.amount)
      : null;
  const canConfirm = !isBusy && !target.blockedReason && target.expectedInDrawer !== null;

  const submit = () => {
    if (!canConfirm) return;
    if (counted === null) {
      setError("Enter the cash you counted.");
      return;
    }
    if (!countVerdict?.ok) {
      setError(countVerdict?.reason ?? "Enter the cash you counted.");
      return;
    }
    setError(null);
    onConfirm(countVerdict.amount);
  };

  const tone = judgement ? VERDICT_TONE[judgement.verdict] : null;

  return (
    <DrawerSheet visible title={target.title} subtitle={target.subtitle} onClose={close} isBusy={isBusy}>
      <View style={styles.expected}>
        <Text style={styles.expectedLabel}>Should be in the drawer</Text>
        <Text style={styles.expectedValue}>
          {target.expectedInDrawer === null ? "—" : formatPeso(target.expectedInDrawer)}
        </Text>
      </View>
      {target.blockedReason ? <Text style={sheetText.error}>{target.blockedReason}</Text> : null}

      <Text style={sheetText.label}>Counted cash</Text>
      <CashInput
        value={text}
        onChangeText={(next) => {
          setText(next);
          setError(null);
        }}
        onSubmitEditing={submit}
        autoFocus
        editable={!isBusy}
        hasError={Boolean(error)}
        accessibilityLabel="Counted cash in pesos"
      />
      {error ? <Text style={sheetText.error}>{error}</Text> : null}

      {judgement && tone ? (
        <View style={[styles.verdict, { backgroundColor: tone.bg }]} accessibilityLiveRegion="polite">
          <Text style={[styles.verdictTitle, { color: tone.fg }]}>
            {tone.label}
            {judgement.variance !== 0 ? ` ${formatPeso(Math.abs(judgement.variance))}` : ""}
          </Text>
          <Text style={styles.verdictBody}>
            {target.isZeroBalance
              ? `Hand over all ${formatPeso(judgement.handOver)} — this drawer ends empty.`
              : `Hand over ${formatPeso(judgement.handOver)} and leave ${formatPeso(
                  Math.min(target.floatToKeep, countVerdict?.ok ? countVerdict.amount : 0),
                )} in the drawer for the next shift.`}
          </Text>
          {judgement.verdict === "short" ? (
            <Text style={styles.verdictHint}>Recount once before you confirm.</Text>
          ) : null}
        </View>
      ) : (
        <Text style={sheetText.hint}>
          {target.isZeroBalance
            ? "Zero-balance drawer: count everything — all of it is handed over."
            : `Count everything in the drawer, float included. ${formatPeso(target.floatToKeep)} stays for the next shift.`}
        </Text>
      )}

      <Button
        label={isBusy ? "Closing…" : "Confirm and end shift"}
        onPress={submit}
        disabled={!canConfirm}
        isLoading={isBusy}
        size="lg"
        fullWidth
        accessibilityLabel="Confirm end of shift"
        style={styles.confirm}
      />
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  expected: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    backgroundColor: colors.heroInk,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  expectedLabel: { ...typography.caption, color: colors.heroInkMuted },
  expectedValue: { fontSize: 24, fontWeight: "800", color: colors.heroInkText },
  verdict: { borderRadius: radius.md, padding: spacing.md, gap: 4 },
  verdictTitle: { ...typography.heading },
  verdictBody: { ...typography.caption, color: colors.textPrimary },
  verdictHint: { ...typography.small, color: colors.textSecondary, fontWeight: "600" },
  confirm: { marginTop: spacing.md },
});
