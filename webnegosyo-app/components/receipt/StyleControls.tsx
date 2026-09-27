import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon, type IconName } from "../Icon";
import { setBlockStyle } from "../../lib/receipt-editor";
import {
  RECEIPT_STYLE_SUPPORT,
  defaultBlockStyle,
  type ReceiptBlock,
  type ReceiptTextAlign,
  type ReceiptTextSize,
  type ReceiptTheme,
} from "../../lib/receipt-layout";
import { MONO_FONT } from "./studio-theme";

/**
 * Size, weight and alignment for one block. Shows what the block prints like
 * right now — the merchant's style merged over the theme default — and offers
 * only what the kind supports: item and total columns cannot go double width,
 * a fill-in rule has nothing to align.
 *
 * The size options are drawn at the size they print, in the receipt's own
 * typeface, so "Large" is a big Aa rather than a word to be believed.
 */

const SIZE_LABELS: Record<ReceiptTextSize, string> = { normal: "Normal", tall: "Tall", large: "Large" };

const ALIGN_OPTIONS: { value: ReceiptTextAlign; label: string; icon: IconName }[] = [
  { value: "left", label: "Align left", icon: "align-left" },
  { value: "center", label: "Align center", icon: "align-center" },
  { value: "right", label: "Align right", icon: "align-right" },
];

/** A text block keeps its alignment on the block itself, so reset leaves it. */
const RESET_PATCH = {
  text: { size: undefined, bold: undefined },
  other: { size: undefined, bold: undefined, align: undefined },
} as const;

function SizeGlyph({ size, isActive }: { size: ReceiptTextSize; isActive: boolean }) {
  const color = isActive ? colors.textOnDark : colors.textPrimary;
  if (size === "large") return <Text style={[styles.glyph, styles.glyphLarge, { color }]}>Aa</Text>;
  if (size === "tall") {
    return (
      <View style={styles.glyphTallBox}>
        <Text style={[styles.glyph, styles.glyphTall, { color }]}>Aa</Text>
      </View>
    );
  }
  return <Text style={[styles.glyph, { color }]}>Aa</Text>;
}

interface StyleControlsProps {
  block: ReceiptBlock;
  theme: ReceiptTheme;
  /** Paper columns, to say how much fits on a large line. */
  columns: number;
  onChange: (block: ReceiptBlock) => void;
}

export function StyleControls({ block, theme, columns, onChange }: StyleControlsProps) {
  const support = RECEIPT_STYLE_SUPPORT[block.kind];
  if (!support) return null;

  const defaults = defaultBlockStyle(block, theme);
  const size = block.style?.size ?? defaults.size;
  const isBold = block.style?.bold ?? defaults.bold;
  const align = block.kind === "text" ? (block.align ?? "left") : (block.style?.align ?? defaults.align);
  const hasCustomStyle = block.style !== undefined;
  const resetPatch = RESET_PATCH[block.kind === "text" ? "text" : "other"];

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Text</Text>
        {hasCustomStyle ? (
          <TouchableOpacity
            onPress={() => onChange(setBlockStyle(block, resetPatch))}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Reset to how the template prints it"
          >
            <Text style={styles.reset}>Reset</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel="Text size">
        {support.sizes.map((option) => {
          const isActive = size === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.sizeOption, isActive && styles.optionActive]}
              onPress={() => onChange(setBlockStyle(block, { size: option }))}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={`${SIZE_LABELS[option]} text`}
            >
              <SizeGlyph size={option} isActive={isActive} />
              <Text style={[styles.sizeLabel, isActive && styles.sizeLabelActive]}>{SIZE_LABELS[option]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.boldToggle, isBold && styles.optionActive]}
          onPress={() => onChange(setBlockStyle(block, { bold: !isBold }))}
          activeOpacity={0.8}
          accessibilityRole="switch"
          accessibilityState={{ checked: isBold }}
          accessibilityLabel="Bold"
        >
          <Icon name="bold" size={17} color={isBold ? colors.textOnDark : colors.textPrimary} />
          <Text style={[styles.boldLabel, isBold && styles.sizeLabelActive]}>Bold</Text>
        </TouchableOpacity>

        {support.align ? (
          <View style={[styles.track, styles.alignTrack]} accessibilityRole="radiogroup" accessibilityLabel="Alignment">
            {ALIGN_OPTIONS.map((option) => {
              const isActive = align === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.alignOption, isActive && styles.optionActive]}
                  onPress={() => onChange(setBlockStyle(block, { align: option.value }))}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
                  accessibilityLabel={option.label}
                >
                  <Icon name={option.icon} size={18} color={isActive ? colors.textOnDark : colors.textPrimary} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>

      {size === "large" ? (
        <Text style={styles.hint}>Large fits {Math.floor(columns / 2)} letters a line — longer text wraps.</Text>
      ) : null}
    </View>
  );
}

const TRACK_PAD = 3;
const CONTROL_HEIGHT = 44;

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...typography.eyebrow, color: colors.textSecondary },
  hint: { ...typography.small, color: colors.textSecondary },
  reset: { fontSize: 13, fontWeight: "700", color: colors.accent },
  track: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: TRACK_PAD,
    gap: TRACK_PAD,
  },
  sizeOption: {
    flex: 1,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md - TRACK_PAD,
    gap: 2,
  },
  optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  glyph: { fontFamily: MONO_FONT, fontSize: 14, fontWeight: "700", lineHeight: 18 },
  glyphTallBox: { height: 22, justifyContent: "center" },
  glyphTall: { transform: [{ scaleY: 1.7 }] },
  glyphLarge: { fontSize: 21, lineHeight: 24 },
  // Full ink, not grey: a muted label on the white track measured 3.6:1.
  sizeLabel: { fontSize: 11, fontWeight: "700", color: colors.textPrimary },
  sizeLabelActive: { color: colors.textOnDark },
  row: { flexDirection: "row", gap: spacing.sm },
  boldToggle: {
    // Matches the align track: control + padding + its 1pt border, top and bottom.
    height: CONTROL_HEIGHT + TRACK_PAD * 2 + 2,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  boldLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  alignTrack: { flex: 1 },
  alignOption: {
    flex: 1,
    height: CONTROL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md - TRACK_PAD,
  },
});
