import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { Icon } from "../../Icon";

interface HomeSearchFieldProps {
  value: string;
  onChange: (text: string) => void;
}

/** Shown under the header when the search action is on: note, paid to, category. */
export function HomeSearchField({ value, onChange }: HomeSearchFieldProps) {
  return (
    <View style={styles.search}>
      <Icon name="search" size={17} color={colors.textMuted} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search note, paid to or category"
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={onChange}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search expenses"
      />
      {value !== "" ? (
        <TouchableOpacity onPress={() => onChange("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
          <Icon name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

interface QuietBannerProps {
  message: string;
  onRetry: () => void;
}

/** A refresh failed but older figures are still on screen: say so, quietly. */
export function QuietBanner({ message, onRetry }: QuietBannerProps) {
  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={onRetry}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${message}. Try again`}
    >
      <Icon name="warning" size={16} color={colors.statusPending.text} />
      <Text style={styles.bannerText}>{message}</Text>
      <Text style={styles.bannerAction}>Try again</Text>
    </TouchableOpacity>
  );
}

interface AddExpenseFabProps {
  onPress: () => void;
}

/** The floating ink pill, bottom-centre over the list, clear of the Owl button bottom-right. */
export function AddExpenseFab({ onPress }: AddExpenseFabProps) {
  return (
    <View style={styles.fabWrap} pointerEvents="box-none">
      <Button label="Add expense" icon="plus" onPress={onPress} fullWidth={false} style={styles.fab} testID="expenses-add" />
    </View>
  );
}

/** First load: grey shapes where the first days will be (the hero is drawn above, waiting). */
export function HomeSkeleton() {
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading expenses" accessibilityRole="progressbar">
      <View style={[styles.block, styles.line, { width: "40%" }]} />
      <View style={[styles.block, styles.rowsBlock]} />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, paddingVertical: spacing.sm },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.statusPending.bg,
  },
  bannerText: { ...typography.caption, color: colors.statusPending.text, flex: 1 },
  bannerAction: { ...typography.caption, fontWeight: "800", color: colors.statusPending.text },
  fabWrap: { position: "absolute", left: 0, right: 0, bottom: spacing.xl, alignItems: "center" },
  fab: { ...shadow.md, paddingHorizontal: spacing.xl, alignSelf: "center" },
  skeleton: { gap: spacing.md, paddingTop: spacing.sm },
  block: { backgroundColor: colors.card, borderRadius: radius.lg, opacity: 0.7 },
  line: { height: 14, borderRadius: radius.full },
  rowsBlock: { height: 180 },
});
