import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { ExpenseCategory } from "../../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { Icon } from "../../Icon";
import { Modal } from "../../Modal";
import { centeredDialog, useCenteredDialog } from "../../pos/dialog-layout";
import { CategoryList } from "../CategoryPicker";

interface CategoryFilterSheetProps {
  categories: readonly ExpenseCategory[];
  selectedId: string | null;
  onPick: (categoryId: string | null) => void;
  onClose: () => void;
}

/**
 * "Show one category": the full grouped list, docked on a phone and centred
 * on a tablet. "Every category" at the top clears the filter.
 */
export function CategoryFilterSheet({ categories, selectedId, onPick, onClose }: CategoryFilterSheetProps) {
  const isCentered = useCenteredDialog();
  const isAll = selectedId === null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, isCentered && centeredDialog.backdrop]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, isCentered && centeredDialog.sheet]}>
          {!isCentered ? <View style={styles.grabber} /> : null}
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              Show one category
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeHit} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.close}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <TouchableOpacity
              style={[styles.allRow, isAll && styles.allRowOn]}
              onPress={() => onPick(null)}
              accessibilityRole="button"
              accessibilityState={{ selected: isAll }}
              accessibilityLabel="Every category"
            >
              <View style={styles.allTile}>
                <Icon name="grid" size={15} color={colors.textPrimary} />
              </View>
              <Text style={styles.allName}>Every category</Text>
              {isAll ? <Icon name="check" size={18} color={colors.accent} /> : null}
            </TouchableOpacity>
            <CategoryList categories={categories} selectedId={selectedId} onPick={(category) => onPick(category.id)} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "88%",
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.title, color: colors.textPrimary, flex: 1 },
  closeHit: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.xs },
  close: { ...typography.body, fontWeight: "600", color: colors.textMuted },
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.lg },
  allRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  allRowOn: { backgroundColor: colors.accentLight },
  allTile: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  allName: { ...typography.body, fontWeight: "600", color: colors.textPrimary, flex: 1 },
});
