import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { describeMode, initialStudioState, layoutOf } from "../../lib/receipt-studio";
import { buildPreviewBlocks } from "../../lib/receipt-preview";
import { ReceiptPaper } from "./ReceiptPaper";
import { studio } from "./studio-theme";

/**
 * The door to the Receipt editor from Printer settings: the store's receipt
 * as it prints today, in miniature, beside what it is called. A merchant
 * setting up a printer is exactly the merchant about to wonder what comes
 * out of it.
 */

const THUMB_WIDTH = 78;
const COLUMNS_58MM = 32;

interface ReceiptDesignCardProps {
  storeName: string;
  savedLayout: unknown;
  logoUrl: string | null;
  onPress: () => void;
}

export function ReceiptDesignCard({ storeName, savedLayout, logoUrl, onPress }: ReceiptDesignCardProps) {
  const { blocks, label } = useMemo(() => {
    const { draft } = initialStudioState(savedLayout);
    return {
      blocks: buildPreviewBlocks(draft.drafts, layoutOf(draft), { storeName, logoUrl, columns: COLUMNS_58MM }),
      label: describeMode(draft.mode),
    };
  }, [savedLayout, storeName, logoUrl]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Receipt design. ${label}. Edit what your receipt prints`}
    >
      <View style={styles.stage} pointerEvents="none">
        <View style={styles.slot} />
        <View style={styles.clip}>
          <ReceiptPaper blocks={blocks} columns={COLUMNS_58MM} width={THUMB_WIDTH} />
        </View>
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Receipt design</Text>
        <Text style={styles.meta}>{label}</Text>
        <Text style={styles.hint}>Your logo, what each line says, how big it prints — and a test print before it goes live.</Text>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Edit design</Text>
          <Icon name="arrow-right" size={15} color={colors.accent} strokeWidth={2} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  stage: {
    width: THUMB_WIDTH + spacing.md * 2,
    height: 128,
    borderRadius: radius.md,
    backgroundColor: studio.canvas,
    alignItems: "center",
    paddingTop: spacing.sm,
    overflow: "hidden",
  },
  slot: { width: THUMB_WIDTH + 8, height: 6, borderRadius: 3, backgroundColor: studio.slotLip, zIndex: 2 },
  clip: { marginTop: -2, overflow: "hidden" },
  copy: { flex: 1, paddingVertical: spacing.xs },
  title: { ...typography.heading, color: colors.textPrimary },
  meta: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, marginTop: 2 },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
  cta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  ctaText: { fontSize: 14, fontWeight: "800", color: colors.accent },
});
