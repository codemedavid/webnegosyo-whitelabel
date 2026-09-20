import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { PartyStepper } from "../tables/PartyStepper";
import { FloorSheet } from "../tables/FloorSheet";
import { STATUS_TONES } from "../tables/floor-tokens";
import { clearedSaleTable, type PosTableDetails } from "../../lib/pos-table";
import { normalizeTableNumber } from "../../lib/order-table-number";
import { buildTableViews, type DiningTable, type TableSeating, type TableView } from "../../lib/tables/table-floor";
import { tableStatusLabel } from "../../lib/tables/table-copy";

interface PosTablePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The sale's current table, shown as the draft when the sheet opens. */
  table: PosTableDetails;
  /** The register's floor. Empty for a store that never drew one — the cashier types instead. */
  tables: readonly DiningTable[];
  seatings: readonly TableSeating[];
  onSave: (table: PosTableDetails) => void;
}

const DEFAULT_PARTY = 2;

/**
 * Which table a dine-in sale is for. The floor's tables are offered as tiles
 * with their live occupancy; a store without a floor plan, or a table not on
 * it, is typed. Either way the sale carries a label, not a key — the order
 * names its table exactly as a web order does.
 */
export function PosTablePickerSheet({ visible, onClose, table, tables, seatings, onSave }: PosTablePickerSheetProps) {
  const [label, setLabel] = useState("");
  const [tableId, setTableId] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(DEFAULT_PARTY);

  useEffect(() => {
    if (!visible) return;
    setLabel(table.label ?? "");
    setTableId(table.tableId);
    setPartySize(table.partySize ?? DEFAULT_PARTY);
  }, [visible, table]);

  const views = useMemo(() => buildTableViews(tables, seatings, [], Date.now()), [tables, seatings]);
  const chosen = views.find((view) => view.table.id === tableId) ?? null;
  const seats = chosen?.table.seats ?? 4;
  const hasLabel = normalizeTableNumber(label) !== "";

  const pick = (view: TableView) => {
    setTableId(view.table.id);
    setLabel(view.table.label);
    if (view.seating) setPartySize(view.seating.partySize);
  };

  return (
    <FloorSheet
      visible={visible}
      title="Which table?"
      subtitle={views.length > 0 ? "Tap a table, or type one" : "Type the table number"}
      onClose={onClose}
      footer={
        <>
          <Button
            label={hasLabel ? `Table ${normalizeTableNumber(label)}` : "Choose a table"}
            onPress={() => onSave({ label: label.trim(), tableId, partySize })}
            size="lg"
            fullWidth
            disabled={!hasLabel}
          />
          {table.label ? (
            <Button label="Remove table from this sale" tone="ghost" onPress={() => onSave(clearedSaleTable().table)} fullWidth />
          ) : null}
        </>
      }
    >
      {views.length > 0 ? (
        <View style={styles.grid}>
          {views.map((view) => {
            const tone = STATUS_TONES[view.status];
            const isChosen = view.table.id === tableId;
            return (
              <TouchableOpacity
                key={view.table.id}
                style={[styles.tile, { borderColor: isChosen ? colors.primary : tone.ring, backgroundColor: isChosen ? colors.primary : tone.fill }]}
                onPress={() => pick(view)}
                accessibilityRole="button"
                accessibilityState={{ selected: isChosen }}
                accessibilityLabel={`Table ${view.table.label}, ${tableStatusLabel(view.status).toLowerCase()}`}
              >
                <Text style={[styles.tileLabel, isChosen && styles.tileLabelChosen]}>{view.table.label}</Text>
                <Text style={[styles.tileMeta, { color: isChosen ? colors.textOnDark : tone.ink }]}>
                  {view.seating ? `${view.covers} seated` : `${view.table.seats} seats`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <TextInput
        style={styles.input}
        value={label}
        onChangeText={(text) => {
          setLabel(text);
          setTableId(null);
        }}
        placeholder="Or type a table, e.g. 12"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="characters"
        accessibilityLabel="Table number"
      />

      <View style={styles.party}>
        <Text style={styles.partyTitle}>How many guests?</Text>
        <PartyStepper value={partySize} seats={seats} onChange={setPartySize} />
      </View>
    </FloorSheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: {
    width: "22%",
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { ...typography.heading, fontSize: 20, color: colors.textPrimary },
  tileLabelChosen: { color: colors.textOnDark },
  tileMeta: { ...typography.small, fontWeight: "600" },
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
  party: { gap: spacing.sm, alignItems: "center" },
  partyTitle: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },
});
