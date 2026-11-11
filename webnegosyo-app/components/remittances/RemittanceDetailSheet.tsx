import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { formatDayKey } from "../../lib/cash/rules-form";
import { amountLabel, resultPill, statusLine, whoLine } from "../../lib/cash/remittance-view";
import { reasonLabel } from "../../lib/cash/reasons";
import { validateResolve, type Remittance, type RemittanceActions } from "../../lib/cash/remittances";
import { formatPeso } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet, sheetText } from "../drawer/DrawerSheet";
import { VerdictPill } from "../VerdictPill";
import type { SheetResult } from "./AcceptRemittanceSheet";

interface RemittanceDetailSheetProps {
  remittance: Remittance;
  actions: RemittanceActions;
  isOffline: boolean;
  onAccept: () => void;
  onResolve: (note: string) => Promise<SheetResult>;
  onOpenSlip: () => void;
  onClose: () => void;
}

const pesos = (cents: number | null): string => (cents === null ? "Not known" : formatPeso(cents / 100));
const clock = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : "";

function Line({ label, value, isStrong = false }: { label: string; value: string; isStrong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, isStrong && styles.strong]}>{value}</Text>
    </View>
  );
}

/**
 * One remittance: who handed over what, the count it came from, and where it
 * stands. The receiver accepts from here; a disputed one is settled here by
 * the owner or another cash manager. Unknown figures say so — never ₱0.
 */
export function RemittanceDetailSheet({ remittance, actions, isOffline, onAccept, onResolve, onOpenSlip, onClose }: RemittanceDetailSheetProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);
  const shift = remittance.shift;
  const pill = resultPill(remittance);
  const reason = reasonLabel(shift?.varianceReason ?? null);

  const resolve = async () => {
    const verdict = validateResolve(note);
    if (!verdict.ok) {
      setError(verdict.reason);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onResolve(verdict.value);
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <DrawerSheet
      visible
      title={remittance.kind === "pickup" ? `Pickup · ${amountLabel(remittance)}` : `Remittance · ${amountLabel(remittance)}`}
      subtitle={whoLine(remittance)}
      onClose={onClose}
      closeLabel="Close"
      isBusy={isBusy}
    >
      <View style={styles.status}>
        <VerdictPill label={pill.label} tone={pill.tone} />
        <Text style={styles.statusText}>{statusLine(remittance)}</Text>
      </View>

      <View style={styles.card}>
        {remittance.businessDay ? <Line label="Business day" value={formatDayKey(remittance.businessDay)} /> : null}
        {shift?.openedAt ? <Line label="Shift" value={`${clock(shift.openedAt)} – ${shift.closedAt ? clock(shift.closedAt) : "open"}`} /> : null}
        {remittance.kind === "shift" ? (
          <>
            <Line label="Should be in drawer" value={pesos(shift?.expectedCents ?? null)} />
            <Line label="Counted" value={shift?.countedCents === null || !shift ? "Not counted" : pesos(shift.countedCents)} />
            {reason ? <Line label="What happened" value={reason} /> : null}
          </>
        ) : null}
        <Line label="Handed over" value={amountLabel(remittance)} isStrong />
        {remittance.receivedCents !== null ? <Line label="Received" value={pesos(remittance.receivedCents)} isStrong /> : null}
        {remittance.receiverNote ? <Line label="Receiver's note" value={remittance.receiverNote} /> : null}
      </View>

      {actions.canAccept ? (
        <Button label="Accept" size="lg" fullWidth onPress={onAccept} disabled={isOffline} />
      ) : null}

      {actions.canResolve ? (
        <>
          <Text style={sheetText.label}>How was it settled?</Text>
          <TextInput
            style={styles.note}
            value={note}
            onChangeText={(next) => {
              setNote(next);
              setError(null);
            }}
            placeholder="Found in the safe, cashier paid back, written off…"
            placeholderTextColor={colors.textTertiary}
            maxLength={300}
            multiline
            editable={!isBusy}
            accessibilityLabel="How it was settled"
          />
          {error ? (
            <Text style={sheetText.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button label="Mark settled" size="lg" fullWidth onPress={() => void resolve()} isLoading={isBusy} disabled={isOffline || isBusy} />
        </>
      ) : null}

      {remittance.kind === "shift" ? <Button label="Open the slip" tone="ghost" icon="receipt" fullWidth onPress={onOpenSlip} /> : null}
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  status: { gap: spacing.sm, alignItems: "flex-start" },
  statusText: { ...typography.body, color: colors.textPrimary },
  card: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginVertical: spacing.sm,
  },
  line: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, minHeight: 28, alignItems: "center" },
  lineLabel: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  lineValue: { ...typography.body, color: colors.textPrimary, fontVariant: ["tabular-nums"], textAlign: "right", flexShrink: 1 },
  strong: { fontWeight: "700" },
  note: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 72,
    textAlignVertical: "top",
  },
});
