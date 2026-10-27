import React, { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";

import { amountLabel, pesoTextToCents } from "../../lib/cash/remittance-view";
import { REMITTANCE_COPY, validateAccept, validateDispute, type Remittance } from "../../lib/cash/remittances";
import { formatPeso } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { CashInput, DrawerSheet, sheetText } from "../drawer/DrawerSheet";

export type SheetResult = { ok: true } | { ok: false; error: string };

type Mode = "confirm" | "different" | "dispute";

interface AcceptRemittanceSheetProps {
  remittance: Remittance;
  isOffline: boolean;
  onAccept: (receivedCents: number, note: string | null) => Promise<SheetResult>;
  onDispute: (reason: string, receivedCents: number | null) => Promise<SheetResult>;
  onClose: () => void;
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;
const pesos = (cents: number): string => formatPeso(cents / 100, cents % 100 === 0 ? 0 : 2);

/**
 * "Did you receive ₱6,345 from Ana?" (06 §4.4). One tap for the common case;
 * "I got a different amount" records the receiver's own count with a note, so
 * the two people's records never disagree silently; "Report a problem" is the
 * missing or short envelope. A forced close has no slip amount, so the
 * receiver counts and types what they got.
 */
export function AcceptRemittanceSheet({ remittance, isOffline, onAccept, onDispute, onClose }: AcceptRemittanceSheetProps) {
  const isUncounted = remittance.handedOverCents === null;
  const [mode, setMode] = useState<Mode>(isUncounted ? "different" : "confirm");
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);
  const cashier = firstName(remittance.cashierName);
  const typedCents = pesoTextToCents(amountText);
  const gap = typedCents !== null && remittance.handedOverCents !== null ? typedCents - remittance.handedOverCents : null;

  const run = async (work: () => Promise<SheetResult>) => {
    setBusy(true);
    setError(null);
    const result = await work();
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  const acceptSlip = () => {
    if (remittance.handedOverCents === null) return;
    const amount = remittance.handedOverCents;
    void run(() => onAccept(amount, null));
  };

  const acceptTyped = () => {
    const verdict = validateAccept(remittance.handedOverCents, typedCents ?? -1, note);
    if (!verdict.ok) {
      setError(verdict.reason);
      return;
    }
    void run(() => onAccept(verdict.value.receivedCents, verdict.value.note));
  };

  const dispute = () => {
    const verdict = validateDispute(note, amountText.trim() ? typedCents ?? -1 : null);
    if (!verdict.ok) {
      setError(verdict.reason);
      return;
    }
    void run(() => onDispute(verdict.value.reason, verdict.value.receivedCents));
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const title =
    mode === "dispute" ? "Report a problem" : isUncounted ? `Count ${cashier}'s cash` : `Did you receive ${amountLabel(remittance)} from ${cashier}?`;

  return (
    <DrawerSheet visible title={title} subtitle={remittance.shift?.drawerName ?? undefined} onClose={onClose} isBusy={isBusy}>
      {isOffline ? <Text style={styles.offline}>{REMITTANCE_COPY.offlineAccept}</Text> : null}

      {mode === "confirm" ? (
        <>
          <Button
            label={`Yes, I received ${amountLabel(remittance)}`}
            size="lg"
            fullWidth
            onPress={acceptSlip}
            isLoading={isBusy}
            disabled={isOffline || isBusy}
          />
          <Button label="I got a different amount" tone="secondary" fullWidth onPress={() => switchTo("different")} disabled={isBusy} />
          <Button label="Report a problem" tone="ghost" fullWidth onPress={() => switchTo("dispute")} disabled={isBusy} />
        </>
      ) : null}

      {mode !== "confirm" ? (
        <>
          <Text style={sheetText.label}>{mode === "dispute" ? "Amount you received (if any)" : "Amount you received"}</Text>
          <CashInput
            value={amountText}
            onChangeText={(next) => {
              setAmountText(next);
              setError(null);
            }}
            editable={!isBusy}
            autoFocus={mode === "different"}
            accessibilityLabel="Amount you received in pesos"
          />
          {gap !== null && gap !== 0 ? (
            <Text style={styles.gap} accessibilityLiveRegion="polite">
              {`${pesos(typedCents as number)} received. ${pesos(Math.abs(gap))} ${gap < 0 ? "less" : "more"} than the slip.`}
            </Text>
          ) : null}
          {isUncounted && mode === "different" ? (
            <Text style={sheetText.hint}>This shift was ended without a count. What you count here is the record.</Text>
          ) : null}
          <Text style={sheetText.label}>{mode === "dispute" ? "What went wrong?" : "Note"}</Text>
          <TextInput
            style={styles.note}
            value={note}
            onChangeText={(next) => {
              setNote(next);
              setError(null);
            }}
            placeholder={mode === "dispute" ? "Envelope missing, short, wrong drawer…" : "What was different?"}
            placeholderTextColor={colors.textTertiary}
            maxLength={300}
            multiline
            editable={!isBusy}
            accessibilityLabel={mode === "dispute" ? "What went wrong" : "Note"}
          />
          {error ? (
            <Text style={sheetText.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            label={mode === "dispute" ? "Report problem" : typedCents !== null ? `Accept ${pesos(typedCents)}` : "Accept"}
            tone={mode === "dispute" ? "danger" : "primary"}
            size="lg"
            fullWidth
            onPress={mode === "dispute" ? dispute : acceptTyped}
            isLoading={isBusy}
            disabled={isOffline || isBusy}
          />
          {!isUncounted ? (
            <Button label="Back" tone="ghost" fullWidth onPress={() => switchTo("confirm")} disabled={isBusy} />
          ) : (
            <Button label="Report a problem instead" tone="ghost" fullWidth onPress={() => switchTo("dispute")} disabled={isBusy} />
          )}
        </>
      ) : error ? (
        <Text style={sheetText.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  offline: {
    ...typography.caption,
    color: colors.statusPending.text,
    backgroundColor: colors.warningLight,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  gap: { ...typography.caption, fontWeight: "700", color: colors.statusPending.text },
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
