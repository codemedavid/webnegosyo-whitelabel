import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { costExplanation, costTiles, type BandTone, type CostKind } from "../../lib/profit/profit-bands";
import type { ProfitReport } from "../../lib/profit/profit-model";
import { colors, radius, shadow, spacing, typography } from "../../theme/colors";
import { Button } from "../Button";
import { DrawerSheet } from "../drawer/DrawerSheet";

const TONES: Readonly<Record<BandTone, { bg: string; fg: string }>> = {
  good: { bg: colors.successLight, fg: colors.success },
  warn: { bg: colors.warningLight, fg: colors.statusPending.text },
  bad: { bg: colors.dangerLight, fg: colors.danger },
  neutral: { bg: colors.surfaceSubtle, fg: colors.textMuted },
};

function BandPill({ label, tone }: { label: string; tone: BandTone }) {
  const palette = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.pillText, { color: palette.fg }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function ExplanationSheet({ kind, report, onClose }: { kind: CostKind; report: ProfitReport; onClose: () => void }) {
  const explanation = costExplanation(kind, report);
  return (
    <DrawerSheet visible title={explanation.title} onClose={onClose} closeLabel="Close">
      {explanation.paragraphs.map((paragraph) => (
        <Text key={paragraph} style={styles.paragraph}>
          {paragraph}
        </Text>
      ))}
      <Button label="Got it" onPress={onClose} tone="secondary" style={styles.sheetButton} />
    </DrawerSheet>
  );
}

/**
 * Food cost, Staff and Rent as shares of sales, each with a gentle guide
 * ("Usual", "On the high side") from what most restaurants see. A tap explains
 * the number in plain words (lib/profit/profit-bands.ts holds the guides).
 */
export function CostTiles({ report }: { report: ProfitReport }) {
  const [openKind, setOpenKind] = useState<CostKind | null>(null);
  return (
    <>
      <View style={styles.row}>
        {costTiles(report).map((tile) => (
          <TouchableOpacity
            key={tile.kind}
            style={styles.tile}
            activeOpacity={0.8}
            onPress={() => setOpenKind(tile.kind)}
            accessibilityRole="button"
            accessibilityLabel={`${tile.label}: ${tile.valueText} of sales, ${tile.bandLabel}`}
            accessibilityHint="Explains this number"
          >
            <Text style={styles.label} numberOfLines={1}>
              {tile.label}
            </Text>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
              {tile.valueText}
            </Text>
            <BandPill label={tile.bandLabel} tone={tile.tone} />
          </TouchableOpacity>
        ))}
      </View>
      {openKind ? <ExplanationSheet kind={openKind} report={report} onClose={() => setOpenKind(null)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    minHeight: 104,
    ...shadow.sm,
  },
  label: { ...typography.small, fontWeight: "700", color: colors.textMuted },
  value: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  pill: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, marginTop: "auto" },
  pillText: { ...typography.small, fontWeight: "700" },
  paragraph: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  sheetButton: { marginTop: spacing.md },
});
