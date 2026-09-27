import React from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import type { ReceiptTheme } from "../../lib/receipt-layout";
import type { PaperWidth } from "../../lib/printer-registry";
import { SectionHeader } from "../SectionHeader";
import { StudioSheet } from "./StudioSheet";
import { MONO_FONT } from "./studio-theme";

/**
 * Whole-receipt settings: the style every block follows, the bold switch for
 * a faint head, and which roll the preview draws on.
 *
 * Paper width is a PREVIEW setting only — the printer prints on whatever roll
 * it is set to in Printer settings — so it says which one the counter uses
 * instead of pretending to change it.
 */

const THEMES: { value: ReceiptTheme; label: string; description: string; sample: string[] }[] = [
  { value: "modern", label: "Modern", description: "Big, bold, centered details", sample: ["  ORDER #4821", "   Dine-in"] },
  { value: "classic", label: "Classic", description: 'Flat "Label: value" rows', sample: ["Order #: 4821", "Type: Dine-in"] },
];

const PAPER_OPTIONS: { value: PaperWidth; label: string; hint: string }[] = [
  { value: 58, label: "58 mm", hint: "32 letters a line" },
  { value: 80, label: "80 mm", hint: "48 letters a line" },
];

interface PaperStyleSheetProps {
  isVisible: boolean;
  theme: ReceiptTheme;
  isBold: boolean;
  paperWidth: PaperWidth;
  /** The counter printer's roll, when this device has one. */
  printerPaperWidth: PaperWidth | null;
  onTheme: (theme: ReceiptTheme) => void;
  onBold: (isBold: boolean) => void;
  onPaperWidth: (width: PaperWidth) => void;
  onClose: () => void;
}

export function PaperStyleSheet({
  isVisible,
  theme,
  isBold,
  paperWidth,
  printerPaperWidth,
  onTheme,
  onBold,
  onPaperWidth,
  onClose,
}: PaperStyleSheetProps) {
  const paperNote =
    printerPaperWidth === null
      ? "Preview only. Your printer's roll is set in Printer settings."
      : `Preview only. Your counter printer uses ${printerPaperWidth} mm paper.`;

  return (
    <StudioSheet isVisible={isVisible} title="Paper & style" onClose={onClose}>
      <SectionHeader title="Style" hint="Every block follows it unless you style the block itself" style={styles.header} />
      <View style={styles.themes}>
        {THEMES.map((option) => {
          const isActive = theme === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.theme, isActive && styles.themeActive]}
              onPress={() => onTheme(option.value)}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={`${option.label} style. ${option.description}`}
            >
              <View style={styles.themeSample}>
                {option.sample.map((line) => (
                  <Text
                    key={line}
                    numberOfLines={1}
                    style={[styles.sampleLine, option.value === "modern" && styles.sampleBold]}
                  >
                    {line}
                  </Text>
                ))}
              </View>
              <View style={styles.themeHead}>
                <Text style={styles.themeLabel}>{option.label}</Text>
                {isActive ? <Icon name="check" size={16} color={colors.accent} strokeWidth={2.5} /> : null}
              </View>
              <Text style={styles.themeDescription}>{option.description}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.boldRow}>
        <View style={styles.boldCopy}>
          <Text style={styles.rowTitle}>Print everything bold</Text>
          <Text style={styles.rowHint}>Darker on a faint or worn printer</Text>
        </View>
        <Switch
          value={isBold}
          onValueChange={onBold}
          trackColor={{ false: colors.separator, true: colors.primary }}
          accessibilityLabel="Print everything bold"
        />
      </View>

      <SectionHeader title="Preview paper" style={styles.spacedHeader} />
      <View style={styles.paperRow}>
        {PAPER_OPTIONS.map((option) => {
          const isActive = paperWidth === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.paper, isActive && styles.paperActive]}
              onPress={() => onPaperWidth(option.value)}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={`Preview on ${option.label} paper`}
            >
              <Text style={[styles.paperLabel, isActive && styles.onInk]}>{option.label}</Text>
              <Text style={[styles.paperHint, isActive && styles.onInkMuted]}>{option.hint}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.note}>{paperNote}</Text>
    </StudioSheet>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 0, marginBottom: spacing.sm },
  spacedHeader: { marginTop: spacing.xl, marginBottom: spacing.sm },
  themes: { flexDirection: "row", gap: spacing.md },
  theme: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  themeActive: { borderColor: colors.accent },
  themeSample: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 4,
    marginBottom: spacing.sm,
  },
  sampleLine: { fontFamily: MONO_FONT, fontSize: 10.5, lineHeight: 15, color: colors.textPrimary },
  sampleBold: { fontWeight: "700" },
  themeHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  themeLabel: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  themeDescription: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  boldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  boldCopy: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  rowHint: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  paperRow: { flexDirection: "row", gap: spacing.md },
  paper: {
    flex: 1,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  paperActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  paperLabel: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  paperHint: { ...typography.small, color: colors.textSecondary, marginTop: 1 },
  onInk: { color: colors.textOnDark },
  onInkMuted: { color: colors.heroInkMuted },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
});
