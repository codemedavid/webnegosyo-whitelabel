import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Modal } from "../Modal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, typography, spacing, radius } from "../../theme/colors";
import type { IngredientIndexRow } from "../../lib/ingredient-service";
import { Icon } from "../Icon";

interface ArchivedIngredientsSheetProps {
  visible: boolean;
  rows: readonly IngredientIndexRow[];
  /** Throws a sentence worth showing when the restore fails. */
  onRestore: (id: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Archived ingredients — off the shelf, history kept — and the way back.
 * Archiving from the phone is only safe because this exists: an archive with
 * no restore is a delete with extra steps.
 */
export function ArchivedIngredientsSheet({ visible, rows, onRestore, onClose }: ArchivedIngredientsSheetProps) {
  const insets = useSafeAreaInsets();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restore = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await onRestore(id);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "That did not restore.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropFill} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Archived</Text>
              <Text style={styles.subtitle}>Hidden from the shelf. Their history is kept.</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.close} accessibilityLabel="Close">
              <Icon name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {rows.length === 0 ? (
              <Text style={styles.empty}>Nothing archived.</Text>
            ) : (
              rows.map((row) => (
                <View key={row.id} style={styles.row}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {row.name}
                    </Text>
                    {row.category ? <Text style={styles.rowMeta}>{row.category}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={styles.restore}
                    onPress={() => restore(row.id)}
                    disabled={busyId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Restore ${row.name}`}
                  >
                    {busyId === row.id ? (
                      <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                      <Text style={styles.restoreText}>Restore</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,14,8,0.5)" },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    maxHeight: "75%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    marginBottom: spacing.lg,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerCopy: { flex: 1 },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  list: { marginTop: spacing.lg },
  listContent: { gap: spacing.sm, paddingBottom: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.lg,
    minHeight: 58,
  },
  rowCopy: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600", color: colors.textSecondary },
  rowMeta: { ...typography.small, color: colors.textTertiary, marginTop: 1 },
  restore: {
    paddingHorizontal: 14,
    height: 34,
    minWidth: 84,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    alignItems: "center",
    justifyContent: "center",
  },
  restoreText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  empty: { ...typography.caption, color: colors.textSecondary, textAlign: "center", padding: spacing.xl },
});
