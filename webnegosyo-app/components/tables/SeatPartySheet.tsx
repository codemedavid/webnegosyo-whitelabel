import React, { useEffect, useState } from "react";
import { StyleSheet, TextInput } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import type { TableView } from "../../lib/tables/table-floor";
import { FloorSheet } from "./FloorSheet";
import { PartyStepper } from "./PartyStepper";

interface SeatPartySheetProps {
  view: TableView | null;
  visible: boolean;
  onClose: () => void;
  onSeat: (partySize: number, note: string) => void;
  isSaving: boolean;
}

const NOTE_MAX_LENGTH = 200;

/** Seat a party: how many, and anything the server should know. */
export function SeatPartySheet({ view, visible, onClose, onSeat, isSaving }: SeatPartySheetProps) {
  const seats = view?.table.seats ?? 4;
  const [partySize, setPartySize] = useState(seats);
  const [note, setNote] = useState("");

  // Re-drafted each time the sheet opens, from the table it opens for.
  useEffect(() => {
    if (!visible) return;
    setPartySize(Math.min(seats, 4));
    setNote("");
  }, [visible, seats]);

  if (!view) return null;

  return (
    <FloorSheet
      visible={visible}
      title={`Seat table ${view.table.label}`}
      subtitle={view.table.zone ?? undefined}
      onClose={onClose}
      footer={
        <Button
          label={`Seat ${partySize} ${partySize === 1 ? "guest" : "guests"}`}
          onPress={() => onSeat(partySize, note.trim())}
          size="lg"
          fullWidth
          isLoading={isSaving}
        />
      }
    >
      <PartyStepper value={partySize} seats={seats} onChange={setPartySize} />
      <TextInput
        style={styles.note}
        value={note}
        onChangeText={setNote}
        placeholder="Note for the server (optional)"
        placeholderTextColor={colors.textTertiary}
        maxLength={NOTE_MAX_LENGTH}
        accessibilityLabel="Note for the server"
      />
    </FloorSheet>
  );
}

const styles = StyleSheet.create({
  note: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
