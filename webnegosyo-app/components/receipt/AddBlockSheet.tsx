import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { BLOCK_GROUPS, BLOCK_PALETTE } from "../../lib/receipt-editor";
import { BLOCK_SAMPLES } from "../../lib/receipt-preview";
import type { ReceiptBlockKind } from "../../lib/receipt-layout";
import { SectionHeader } from "../SectionHeader";
import { StudioSheet } from "./StudioSheet";
import { MONO_FONT, studio } from "./studio-theme";

/**
 * The block library. Each block is shown by a scrap of the line it prints, in
 * the receipt's own typeface — a merchant looking for "the total" recognises
 * TOTAL 459.75 faster than an icon — and a tap drops it straight onto the
 * paper, selected, ready to edit.
 */
interface AddBlockSheetProps {
  isVisible: boolean;
  /** Where the block will land, e.g. "below Business name". */
  placement: string;
  onAdd: (kind: ReceiptBlockKind) => void;
  onClose: () => void;
}

export function AddBlockSheet({ isVisible, placement, onAdd, onClose }: AddBlockSheetProps) {
  return (
    <StudioSheet isVisible={isVisible} title="Add a block" subtitle={`Lands ${placement}`} onClose={onClose}>
      {BLOCK_GROUPS.map((group) => (
        <View key={group} style={styles.group}>
          <SectionHeader title={group} style={styles.groupHeader} />
          <View style={styles.list}>
            {BLOCK_PALETTE.filter((entry) => entry.group === group).map((entry, index, entries) => (
              <TouchableOpacity
                key={entry.kind}
                style={[styles.row, index < entries.length - 1 && styles.rowDivided]}
                onPress={() => onAdd(entry.kind)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Add ${entry.label}. ${entry.description}`}
              >
                <View style={styles.scrap}>
                  <Text style={styles.scrapText} numberOfLines={1} ellipsizeMode="clip">
                    {BLOCK_SAMPLES[entry.kind]}
                  </Text>
                </View>
                <View style={styles.copy}>
                  <Text style={styles.label} numberOfLines={1}>
                    {entry.label}
                  </Text>
                  <Text style={styles.description} numberOfLines={2}>
                    {entry.description}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </StudioSheet>
  );
}

const SCRAP_WIDTH = 104;

const styles = StyleSheet.create({
  group: { marginBottom: spacing.lg },
  groupHeader: { marginTop: 0, marginBottom: spacing.sm },
  list: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  scrap: {
    width: SCRAP_WIDTH,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    backgroundColor: studio.paper,
    borderWidth: 1,
    borderColor: studio.paperHairline,
    borderRadius: 4,
    overflow: "hidden",
  },
  scrapText: { fontFamily: MONO_FONT, fontSize: 11, fontWeight: "700", color: studio.paperInk, textAlign: "center" },
  copy: { flex: 1 },
  label: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  description: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
});
