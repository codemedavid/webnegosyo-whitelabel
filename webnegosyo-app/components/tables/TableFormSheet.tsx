import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { IconButton } from "../IconButton";
import { SegmentedControl } from "../SegmentedControl";
import type { DiningTable, TableShape, TableSize } from "../../lib/tables/table-floor";
import {
  emptyTableDraft,
  SEATS_MAX,
  SEATS_MIN,
  validateTableDraft,
  type TableDraft,
  type TableDraftValue,
} from "../../lib/tables/table-form";
import { FloorSheet } from "./FloorSheet";

interface TableFormSheetProps {
  visible: boolean;
  /** The table being edited; null adds a new one. */
  table: DiningTable | null;
  /** Every live table on this floor, for the label clash check and the next label. */
  floorTables: readonly DiningTable[];
  onClose: () => void;
  onSave: (value: TableDraftValue) => void;
  onArchive?: (table: DiningTable) => void;
  isSaving: boolean;
}

const SHAPES: readonly { label: string; value: TableShape }[] = [
  { label: "Round", value: "round" },
  { label: "Square", value: "square" },
  { label: "Long", value: "rect" },
];
const SIZES: readonly { label: string; value: TableSize }[] = [
  { label: "Small", value: "sm" },
  { label: "Medium", value: "md" },
  { label: "Large", value: "lg" },
];

function draftFrom(table: DiningTable | null, floorTables: readonly DiningTable[]): TableDraft {
  if (!table) return emptyTableDraft(floorTables.map((entry) => entry.label));
  return { label: table.label, seats: String(table.seats), shape: table.shape, size: table.size, zone: table.zone ?? "" };
}

/** Add or edit a table: name, seats, shape, footprint, zone. */
export function TableFormSheet({ visible, table, floorTables, onClose, onSave, onArchive, isSaving }: TableFormSheetProps) {
  const [draft, setDraft] = useState<TableDraft>(() => draftFrom(table, floorTables));
  const [error, setError] = useState<{ field: keyof TableDraft; message: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraft(draftFrom(table, floorTables));
    setError(null);
  }, [visible, table, floorTables]);

  const update = (patch: Partial<TableDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const stepSeats = (delta: number) => {
    const current = Number(draft.seats) || 0;
    update({ seats: String(Math.min(SEATS_MAX, Math.max(SEATS_MIN, current + delta))) });
  };

  const submit = () => {
    const verdict = validateTableDraft(draft, floorTables, table?.id);
    if (!verdict.ok) {
      setError({ field: verdict.field, message: verdict.error });
      return;
    }
    onSave(verdict.value);
  };

  return (
    <FloorSheet
      visible={visible}
      title={table ? `Edit table ${table.label}` : "Add a table"}
      onClose={onClose}
      footer={
        <>
          <Button label={table ? "Save" : "Add to floor"} onPress={submit} size="lg" fullWidth isLoading={isSaving} />
          {table && onArchive ? (
            <Button label="Remove from floor" tone="ghost" onPress={() => onArchive(table)} fullWidth />
          ) : null}
        </>
      }
    >
      <Field label="Name or number" error={error?.field === "label" ? error.message : null}>
        <TextInput
          style={[styles.input, error?.field === "label" && styles.inputError]}
          value={draft.label}
          onChangeText={(label) => update({ label })}
          placeholder="12, A3, Patio 2"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="characters"
          accessibilityLabel="Table name or number"
        />
      </Field>

      <Field label="Seats" error={error?.field === "seats" ? error.message : null}>
        <View style={styles.seatsRow}>
          <IconButton icon="minus" label="Fewer seats" onPress={() => stepSeats(-1)} />
          <TextInput
            style={[styles.input, styles.seatsInput, error?.field === "seats" && styles.inputError]}
            value={draft.seats}
            onChangeText={(seats) => update({ seats })}
            keyboardType="number-pad"
            accessibilityLabel="Seats"
          />
          <IconButton icon="plus" label="More seats" onPress={() => stepSeats(1)} />
        </View>
      </Field>

      <Field label="Shape">
        <SegmentedControl<TableShape>
          options={SHAPES}
          value={draft.shape}
          onChange={(shape) => update({ shape })}
          accessibilityPrefix="Shape"
        />
      </Field>

      <Field label="Footprint">
        <SegmentedControl<TableSize>
          options={SIZES}
          value={draft.size}
          onChange={(size) => update({ size })}
          accessibilityPrefix="Footprint"
        />
      </Field>

      <Field label="Zone (optional)" error={error?.field === "zone" ? error.message : null}>
        <TextInput
          style={[styles.input, error?.field === "zone" && styles.inputError]}
          value={draft.zone}
          onChangeText={(zone) => update({ zone })}
          placeholder="Indoor, Patio, Bar"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Zone"
        />
      </Field>
    </FloorSheet>
  );
}

function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },
  fieldError: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputError: { borderColor: colors.danger },
  seatsRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  seatsInput: { flex: 1, textAlign: "center", fontSize: 20, fontWeight: "700" },
});
