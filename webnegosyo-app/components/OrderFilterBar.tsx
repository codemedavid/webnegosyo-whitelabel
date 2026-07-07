import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";

export type SortOrder = "newest" | "oldest";

export interface StatusFilterOption {
  key: string;
  label: string;
  count: number;
}

interface OrderFilterBarProps {
  filters: StatusFilterOption[];
  activeFilter: string;
  onFilterChange: (key: string) => void;
  sort: SortOrder;
  onSortToggle: () => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export function OrderFilterBar({
  filters,
  activeFilter,
  onFilterChange,
  sort,
  onSortToggle,
  search,
  onSearchChange,
}: OrderFilterBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search name or contact"
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={onSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => onSearchChange("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Text style={styles.clearLabel}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={onSortToggle}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${sort === "newest" ? "newest" : "oldest"} first`}
        >
          <Text style={styles.sortText}>{sort === "newest" ? "Newest first" : "Oldest first"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        {filters.map((filter) => {
          const isActive = filter.key === activeFilter;
          return (
            <TouchableOpacity
              key={filter.key}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => onFilterChange(filter.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{filter.label}</Text>
              <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
                <Text style={[styles.countText, isActive && styles.countTextActive]}>{filter.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
  clearLabel: { ...typography.small, color: colors.textTertiary, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  sortButton: {
    height: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  sortText: { ...typography.caption, color: colors.textPrimary, fontWeight: "600" },
  pillRow: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  pillTextActive: { color: colors.textOnDark },
  countBadge: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    alignItems: "center",
  },
  countBadgeActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  countText: { fontSize: 11, fontWeight: "800", color: colors.textSecondary },
  countTextActive: { color: colors.textOnDark },
});
