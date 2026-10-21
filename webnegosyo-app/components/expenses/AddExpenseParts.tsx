import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

import { shortCategoryName } from "../../lib/expenses/category-look";
import { PAID_FROM_LABELS, PICKABLE_PAID_FROM } from "../../lib/expenses/expense-format";
import { formatPeso } from "../../lib/expenses/keypad";
import type { RepeatSuggestion } from "../../lib/expenses/repeat-chips";
import type { BookPaidFrom } from "../../lib/expenses/add-expense-form";
import type { ExpenseCategory } from "../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon, type IconName } from "../Icon";
import { CategoryGrid as IconCategoryGrid, CategoryList } from "./CategoryPicker";

// ── Chips ─────────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  isOn?: boolean;
  onPress: () => void;
  icon?: IconName;
  isDashed?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** A pill: coral ring on the light coral fill when chosen (the sheet's selection idiom). */
export function Chip({ label, isOn = false, onPress, icon, isDashed = false, accessibilityLabel, style }: ChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, isDashed && styles.chipDashed, isOn && styles.chipOn, style]}
      accessibilityRole="button"
      accessibilityState={{ selected: isOn }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon ? <Icon name={icon} size={13} color={colors.textPrimary} /> : null}
      <Text style={[styles.chipText, isOn && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Paid from (book) / the drawer (drawer mode) ───────────────────────────

interface PaidFromRowProps {
  value: BookPaidFrom;
  onPick: (next: BookPaidFrom) => void;
}

/** Where the money came from, always visible: Cash on hand · GCash · Maya · Bank · Card · Owner's pocket. */
export function PaidFromRow({ value, onPick }: PaidFromRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollRow}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Paid from"
    >
      {PICKABLE_PAID_FROM.map((source) => (
        <Chip
          key={source}
          label={PAID_FROM_LABELS[source]}
          isOn={source === value}
          onPress={() => onPick(source)}
          accessibilityLabel={`Paid from ${PAID_FROM_LABELS[source]}`}
        />
      ))}
    </ScrollView>
  );
}

interface DrawerLineProps {
  chipLabel: string;
  /** "Drawer has ₱4,620"; null = unknown, said nothing. */
  availableCents: number | null;
}

export function DrawerLine({ chipLabel, availableCents }: DrawerLineProps) {
  return (
    <View style={styles.drawerLine}>
      <View style={styles.drawerChip} accessible accessibilityLabel={`Paid from ${chipLabel}`}>
        <View style={styles.drawerDot} />
        <Text style={styles.drawerChipText} numberOfLines={1}>
          {chipLabel}
        </Text>
      </View>
      {availableCents !== null ? (
        <Text style={styles.drawerHas} accessibilityLabel={`Drawer has ${formatPeso(Math.max(0, availableCents))}`}>
          Drawer has <Text style={styles.strong}>{formatPeso(Math.max(0, availableCents))}</Text>
        </Text>
      ) : null}
    </View>
  );
}

// ── Repeats ───────────────────────────────────────────────────────────────

interface RepeatRowProps {
  suggestions: readonly RepeatSuggestion[];
  onPick: (suggestion: RepeatSuggestion) => void;
}

export function RepeatRow({ suggestions, onPick }: RepeatRowProps) {
  if (suggestions.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow} keyboardShouldPersistTaps="handled">
      {suggestions.map((suggestion) => {
        const name = shortCategoryName(suggestion.categoryName);
        const amount = formatPeso(suggestion.amountCents);
        return (
          <Chip
            key={`${suggestion.categoryId}|${suggestion.amountCents}`}
            label={`${name} ${amount}`}
            icon="repeat"
            isDashed
            onPress={() => onPick(suggestion)}
            accessibilityLabel={`Repeat ${name}, ${amount}`}
          />
        );
      })}
    </ScrollView>
  );
}

// ── Extras: Photo · Note · Date · Paid to ─────────────────────────────────

export interface ExtraItem {
  key: string;
  icon: IconName;
  label: string;
  /** Spoken name; defaults to the label. */
  accessibilityLabel?: string;
  isSet: boolean;
  isWarn?: boolean;
  isOpen?: boolean;
  onPress: () => void;
}

/** Equal buttons under the grid; a filled tile once its detail is set. */
export function ExtrasRow({ items }: { items: readonly ExtraItem[] }) {
  return (
    <View style={styles.extras}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={[styles.extra, item.isSet && styles.extraSet, item.isWarn && styles.extraWarn, item.isOpen && styles.extraOpen]}
          onPress={item.onPress}
          accessibilityRole="button"
          accessibilityState={{ expanded: item.isOpen, selected: item.isSet }}
          accessibilityLabel={item.accessibilityLabel ?? item.label}
          testID={`expense-extra-${item.key}`}
        >
          <Icon name={item.isSet ? "check" : item.icon} size={16} color={item.isSet ? colors.accent : colors.textPrimary} />
          <Text style={[styles.extraText, item.isSet && styles.extraTextSet]} numberOfLines={1}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

interface FoldInputProps {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  maxLength: number;
  accessibilityLabel: string;
  onDone?: () => void;
}

export function FoldInput({ value, onChange, placeholder, maxLength, accessibilityLabel, onDone }: FoldInputProps) {
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      maxLength={maxLength}
      autoFocus
      returnKeyType="done"
      onSubmitEditing={onDone}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export function StockQuestion({ value, onAnswer }: { value: boolean | null; onAnswer: (next: boolean) => void }) {
  return (
    <View style={styles.stock}>
      <Text style={styles.stockText}>Did this go into your stock count?</Text>
      <View style={styles.stockChoices}>
        <Chip label="Yes" isOn={value === true} onPress={() => onAnswer(true)} accessibilityLabel="Yes, it went into stock" />
        <Chip label="No" isOn={value === false} onPress={() => onAnswer(false)} accessibilityLabel="No, not into stock" />
      </View>
    </View>
  );
}

/** "‹ All categories" over the list that replaces the grid in place. */
export function BackRow({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <TouchableOpacity onPress={onBack} style={styles.backRow} accessibilityRole="button" accessibilityLabel={`Back. ${label}`}>
      <Icon name="chevron-left" size={18} color={colors.textPrimary} />
      <Text style={styles.backText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Kept for the sort / change sheets until they move to CategoryPicker ──

/** @deprecated Use `CategoryGrid` from `./CategoryPicker`. */
export function CategoryGrid(props: {
  ranked: readonly ExpenseCategory[];
  selectedId: string | null;
  onPick: (category: ExpenseCategory) => void;
  onMore: () => void;
}) {
  return <IconCategoryGrid ranked={props.ranked} selectedId={props.selectedId} onPick={props.onPick} onShowAll={props.onMore} />;
}

/** @deprecated Use `CategoryList` from `./CategoryPicker` with a `BackRow`. */
export function AllCategories(props: {
  categories: readonly ExpenseCategory[];
  selectedId: string | null;
  onPick: (category: ExpenseCategory) => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.all}>
      <BackRow label="All categories" onBack={props.onBack} />
      <ScrollView style={styles.all} keyboardShouldPersistTaps="handled">
        <CategoryList categories={props.categories} selectedId={props.selectedId} onPick={props.onPick} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: colors.surfaceSubtle,
  },
  chipDashed: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.textTertiary, borderStyle: "dashed" },
  chipOn: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  chipText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  chipTextOn: { fontWeight: "700" },

  drawerLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  drawerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    minHeight: 30,
    borderRadius: radius.full,
    backgroundColor: colors.successLight,
    flexShrink: 1,
  },
  drawerDot: { width: 7, height: 7, borderRadius: radius.full, backgroundColor: colors.success },
  drawerChipText: { ...typography.caption, fontWeight: "700", color: colors.success, flexShrink: 1 },
  drawerHas: { ...typography.caption, color: colors.textMuted },
  strong: { fontWeight: "800", color: colors.textPrimary, fontVariant: ["tabular-nums"] },

  extras: { flexDirection: "row", gap: spacing.sm },
  extra: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 52,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: colors.surfaceSubtle,
  },
  extraSet: { backgroundColor: colors.accentLight, borderColor: colors.accentLight },
  extraWarn: { borderColor: colors.accent },
  extraOpen: { borderColor: colors.accent },
  extraText: { ...typography.small, fontWeight: "600", color: colors.textMuted, maxWidth: "100%" },
  extraTextSet: { color: colors.textPrimary, fontWeight: "700" },

  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1.5,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },

  stock: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    paddingLeft: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  stockText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  stockChoices: { flexDirection: "row", gap: spacing.xs },

  backRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44 },
  backText: { ...typography.heading, color: colors.textPrimary },
  all: { flex: 1 },
});
