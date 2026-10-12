import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { formatPeso } from "../../../lib/format";
import type { PosCartLine } from "../../../lib/pos-cart";
import type { PosGovSession } from "../../../lib/pos-gov-discount";
import { availableUnits, withUnits, type ClaimantDraft, type ShareChoice } from "../../../lib/pos-gov-draft";
import { Stepper } from "./Stepper";

type Props = {
  draft: ClaimantDraft;
  onChange: (draft: ClaimantDraft) => void;
  cart: readonly PosCartLine[];
  /** The session WITHOUT this draft — so its own units are not "taken". */
  others: PosGovSession;
  excluded: ReadonlySet<string>;
  allowShared: boolean;
  diners: number;
  minDiners: number;
  onDinersChange: (diners: number) => void;
};

const CHOICES: readonly { key: ShareChoice; title: string; caption: string }[] = [
  { key: "whole", title: "Just them", caption: "Eating alone" },
  { key: "items", title: "Their items", caption: "Pick their dishes" },
  { key: "shared", title: "Shared table", caption: "Split by diners" },
];

/**
 * Step 3 — what is theirs. The law discounts only the claimant's own
 * consumption, so a group order needs one of these answers; "Shared table" is
 * the DSWD/NCMB rule for food eaten together (bill ÷ diners).
 */
export function ShareStep(props: Props) {
  const { draft, onChange, allowShared } = props;
  const choices = CHOICES.filter((choice) => allowShared || choice.key !== "shared");

  return (
    <View style={styles.wrap}>
      <View style={styles.segment} accessibilityRole="tablist">
        {choices.map((choice) => {
          const isActive = draft.share === choice.key;
          return (
            <TouchableOpacity
              key={choice.key}
              style={[styles.segmentItem, isActive && styles.segmentActive]}
              onPress={() => onChange({ ...draft, share: choice.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.segmentTitle, isActive && styles.segmentTitleActive]}>{choice.title}</Text>
              <Text style={[styles.segmentCaption, isActive && styles.segmentCaptionActive]}>{choice.caption}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!allowShared ? (
        <Text style={styles.note}>Take-out and delivery: only their own serving is covered.</Text>
      ) : null}

      {draft.share === "shared" ? <SharedTable {...props} /> : <ItemPicker {...props} />}
    </View>
  );
}

function ItemPicker({ draft, onChange, cart, others, excluded }: Props) {
  const isWhole = draft.share === "whole";
  return (
    <View style={styles.list}>
      {cart.map((line) => {
        const isExcluded = excluded.has(line.menuItemId);
        const available = availableUnits(line, others, draft.id, excluded);
        const picked = isWhole ? available : Math.min(draft.units[line.key] ?? 0, available);
        return (
          <View key={line.key} style={[styles.itemRow, isExcluded && styles.itemRowMuted]}>
            <View style={styles.itemText}>
              <Text style={styles.itemName} numberOfLines={1}>
                {line.quantity > 1 ? `${line.quantity}× ` : ""}
                {line.name}
              </Text>
              <Text style={styles.itemMeta}>
                {isExcluded
                  ? "Not covered by the discount"
                  : available < line.quantity
                    ? `${formatPeso(line.unitPrice)} each · ${line.quantity - available} already claimed`
                    : `${formatPeso(line.unitPrice)} each`}
              </Text>
            </View>
            {isExcluded ? null : isWhole ? (
              <Text style={styles.wholeCount}>{picked > 0 ? `${picked} ✓` : "—"}</Text>
            ) : (
              <Stepper
                value={picked}
                min={0}
                max={available}
                label={line.name}
                onChange={(count) => onChange(withUnits(draft, line.key, count))}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function SharedTable({ diners, minDiners, onDinersChange }: Props) {
  return (
    <View style={styles.sharedCard}>
      <Text style={styles.sharedLabel}>People sharing the table</Text>
      <Stepper value={diners} min={minDiners} max={50} label="diners" size="lg" onChange={onDinersChange} />
      <Text style={styles.sharedHelp}>
        Their share is the shared food divided by {diners} {diners === 1 ? "person" : "people"}. Count
        everyone eating, including the claimant.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentTitle: { ...typography.caption, fontWeight: "700", color: colors.textPrimary },
  segmentTitleActive: { color: colors.textOnDark },
  segmentCaption: { ...typography.small, color: colors.textSecondary },
  segmentCaptionActive: { color: colors.heroInkMuted },
  note: { ...typography.caption, color: colors.textSecondary },
  list: { gap: spacing.xs },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  itemRowMuted: { opacity: 0.5 },
  itemText: { flex: 1, gap: 2 },
  itemName: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  itemMeta: { ...typography.caption, color: colors.textSecondary },
  wholeCount: { ...typography.body, fontWeight: "700", color: colors.success, minWidth: 40, textAlign: "right" },
  sharedCard: {
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  sharedLabel: { ...typography.eyebrow, color: colors.textSecondary },
  sharedHelp: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
});
