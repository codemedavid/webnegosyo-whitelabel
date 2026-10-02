import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, typography, spacing, radius } from "../../theme/colors";
import {
  filterStockViews,
  formatStockQuantity,
  type StockItemView,
} from "../../lib/inventory-stock";
import type { ManualMovementReason } from "../../lib/inventory-movement";
import { Icon } from "../Icon";
import { LEVEL_STYLE } from "./level-style";

const COPY: Record<ManualMovementReason, { title: string; subtitle: string }> = {
  receive: { title: "Receive a delivery", subtitle: "Which ingredient arrived?" },
  stocktake: { title: "Count stock", subtitle: "Which ingredient are you counting?" },
  waste: { title: "Record waste", subtitle: "Which ingredient was thrown away?" },
};

interface IngredientPickerSheetProps {
  /** Null = closed. */
  reason: ManualMovementReason | null;
  shelf: readonly StockItemView[];
  onPick: (item: StockItemView, reason: ManualMovementReason) => void;
  onClose: () => void;
  /** iOS only: the sheet has finished animating away. */
  onDismissed?: () => void;
}

/**
 * "Which one?" for the shortcuts on the Stock screen. Search is focused on
 * open because a merchant holding a delivery note already knows the name.
 */
export function IngredientPickerSheet({
  reason,
  shelf,
  onPick,
  onClose,
  onDismissed,
}: IngredientPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () => filterStockViews(shelf, { level: "all", query }),
    [shelf, query],
  );

  const close = () => {
    setQuery("");
    onClose();
  };

  const copy = reason ? COPY[reason] : null;

  return (
    <Modal
      visible={reason !== null}
      transparent
      animationType="slide"
      onRequestClose={close}
      onDismiss={onDismissed}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity style={styles.backdropFill} onPress={close} activeOpacity={1} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{copy?.title}</Text>
              <Text style={styles.subtitle}>{copy?.subtitle}</Text>
            </View>
            <TouchableOpacity onPress={close} style={styles.close} accessibilityLabel="Close">
              <Icon name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.search}>
            <Icon name="search" size={18} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search ingredients"
              placeholderTextColor={colors.textTertiary}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>

          <FlatList
            data={matches}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={<Text style={styles.empty}>No ingredient by that name.</Text>}
            renderItem={({ item }) => {
              const level = LEVEL_STYLE[item.level];
              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    if (!reason) return;
                    setQuery("");
                    onPick(item, reason);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                >
                  <View style={[styles.dot, { backgroundColor: level.fill }]} />
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowQty}>
                    {formatStockQuantity(item.quantity, item.unitAbbreviation)}
                  </Text>
                  <Icon name="chevron" size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
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
    height: "78%",
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
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.md,
    height: 46,
    marginTop: spacing.lg,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary },
  list: { marginTop: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 36 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  rowName: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowQty: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  empty: { ...typography.caption, color: colors.textSecondary, textAlign: "center", padding: spacing.xl },
});
