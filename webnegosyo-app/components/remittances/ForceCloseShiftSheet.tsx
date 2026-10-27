import React, { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";

import { forceCloseShift, type ForceCloseResult } from "../../lib/cash/remittances";
import { liveCashDb } from "../../lib/cash/use-cash-rules";
import type { CashDb } from "../../lib/cash/settings";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet, sheetText } from "../drawer/DrawerSheet";

export interface ForceCloseTarget {
  id: string;
  staffName: string;
  drawerName: string | null;
  openedAt: string;
}

interface ForceCloseShiftSheetProps {
  shift: ForceCloseTarget;
  isOffline: boolean;
  nowMs: number;
  onDone: (result: ForceCloseResult) => void;
  onClose: () => void;
  /** Injected in tests; the signed-in session otherwise. */
  db?: CashDb;
}

const HOUR_MS = 60 * 60 * 1000;
const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/**
 * "End for him" (06 §2, §4.5): a cash manager closes a shift the cashier
 * forgot. No count is invented — the drawer goes to the remittance inbox as
 * "Not counted yet" and whoever receives the cash counts it there. Mounted by
 * the Drawer's floor view (DrawersOverview) and the Home strip.
 */
export function ForceCloseShiftSheet({ shift, isOffline, nowMs, onDone, onClose, db = liveCashDb }: ForceCloseShiftSheetProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);
  const name = firstName(shift.staffName);
  const hours = Math.max(1, Math.floor((nowMs - Date.parse(shift.openedAt)) / HOUR_MS));
  const where = shift.drawerName ? ` on ${shift.drawerName}` : "";

  const end = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await forceCloseShift(db, shift.id, note));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The shift could not be ended.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerSheet
      visible
      title={`End ${name}'s shift?`}
      subtitle={`Open${where} for ${hours}h`}
      onClose={onClose}
      isBusy={isBusy}
    >
      <Text style={styles.body}>
        {`Nothing is counted now. The drawer goes to Remittances as not counted, and whoever takes the cash counts it there.`}
      </Text>
      <Text style={sheetText.label}>Note (optional)</Text>
      <TextInput
        style={styles.note}
        value={note}
        onChangeText={(next) => {
          setNote(next);
          setError(null);
        }}
        placeholder={`${name} went home without ending it`}
        placeholderTextColor={colors.textTertiary}
        maxLength={300}
        multiline
        editable={!isBusy}
        accessibilityLabel="Note"
      />
      {isOffline ? <Text style={sheetText.hint}>{"You're offline. Connect to end the shift."}</Text> : null}
      {error ? (
        <Text style={sheetText.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        label={`End ${name}'s shift`}
        tone="danger"
        size="lg"
        fullWidth
        onPress={() => void end()}
        isLoading={isBusy}
        disabled={isOffline || isBusy}
      />
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.textPrimary, lineHeight: 21 },
  note: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 64,
    textAlignVertical: "top",
  },
});
