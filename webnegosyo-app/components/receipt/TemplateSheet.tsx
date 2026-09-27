import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import { RECEIPT_TEMPLATES, initialStudioState, layoutOf, type StudioMode } from "../../lib/receipt-studio";
import { buildPreviewBlocks, type PreviewConfig } from "../../lib/receipt-preview";
import type { ReceiptPresetName } from "../../lib/receipt-layout";
import { ReceiptPaper } from "./ReceiptPaper";
import { StudioSheet } from "./StudioSheet";
import { studio } from "./studio-theme";

/**
 * The starting points, shown as the receipts they print — the real engine at
 * thumbnail size with the store's own name on top — not as names to be
 * imagined. Picking one over a custom design is undoable from the studio.
 */

const THUMB_WIDTH = 150;
const THUMB_HEIGHT = 210;

interface TemplateSheetProps {
  isVisible: boolean;
  current: StudioMode;
  preview: PreviewConfig;
  onPick: (name: ReceiptPresetName) => void;
  onClose: () => void;
}

export function TemplateSheet({ isVisible, current, preview, onPick, onClose }: TemplateSheetProps) {
  const thumbs = useMemo(
    () =>
      RECEIPT_TEMPLATES.map((template) => {
        const { draft } = initialStudioState(template.name);
        return { template, blocks: buildPreviewBlocks(draft.drafts, layoutOf(draft), preview) };
      }),
    [preview],
  );
  const subtitle =
    current === "custom"
      ? "Replaces your custom design — you can undo it"
      : "Every receipt picks up improvements to its template";

  return (
    <StudioSheet isVisible={isVisible} title="Start from a template" subtitle={subtitle} onClose={onClose}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        style={styles.railScroll}
      >
        {thumbs.map(({ template, blocks }) => {
          const isCurrent = template.name === current;
          return (
            <TouchableOpacity
              key={template.name}
              style={styles.card}
              onPress={() => onPick(template.name)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${template.label} template. ${template.description}`}
              accessibilityState={{ selected: isCurrent }}
            >
              <View style={[styles.stage, isCurrent && styles.stageCurrent]}>
                <View style={styles.clip}>
                  <ReceiptPaper blocks={blocks} columns={preview.columns} width={THUMB_WIDTH - spacing.lg * 2} />
                </View>
                {isCurrent ? (
                  <View style={styles.badge}>
                    <Icon name="check" size={12} color={colors.textOnDark} strokeWidth={2.5} />
                    <Text style={styles.badgeText}>In use</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.label}>{template.label}</Text>
              <Text style={styles.description} numberOfLines={2}>
                {template.description}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </StudioSheet>
  );
}

const styles = StyleSheet.create({
  railScroll: { marginHorizontal: -spacing.xl },
  rail: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm },
  card: { width: THUMB_WIDTH },
  stage: {
    height: THUMB_HEIGHT,
    borderRadius: radius.lg,
    backgroundColor: studio.canvas,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
  },
  stageCurrent: { borderColor: colors.accent },
  clip: { flex: 1, overflow: "hidden", borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  badge: {
    position: "absolute",
    bottom: spacing.sm,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  badgeText: { fontSize: 11, fontWeight: "800", color: colors.textOnDark },
  label: { fontSize: 15, fontWeight: "800", color: colors.textPrimary, marginTop: spacing.sm },
  description: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
});
