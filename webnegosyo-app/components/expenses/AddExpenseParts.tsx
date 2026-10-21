import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { GROUP_LABELS, sortCategories } from "../../lib/expenses/categories";
import { PAID_FROM_LABELS, PICKABLE_PAID_FROM, dayLabel } from "../../lib/expenses/expense-format";
import { formatPeso } from "../../lib/expenses/keypad";
import type { RepeatSuggestion } from "../../lib/expenses/repeat-chips";
import { EXPENSE_GROUPS, type ExpenseCategory, type ExpenseGroup, type PaidFrom } from "../../lib/expenses/types";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon, type IconName } from "../Icon";
import { CategoryBadge } from "./CategoryBadge";

function shortName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "");
}

// ── Paid from ─────────────────────────────────────────────────────────────

export function PaidFromPill({
  lockedDrawerName,
  paidFrom,
  isOpen,
  onToggle,
}: {
  lockedDrawerName: string | null;
  paidFrom: Exclude<PaidFrom, "drawer">;
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (lockedDrawerName !== null) {
    return (
      <View style={[styles.pill, styles.pillLocked]} accessibilityLabel={`Paid from the ${lockedDrawerName} drawer. Locked.`}>
        <Icon name="lock" size={14} color={colors.success} />
        <Text style={styles.pillLockedText} numberOfLines={1}>
          From: {lockedDrawerName} drawer
        </Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={styles.pill}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: isOpen }}
      accessibilityLabel={`Paid from ${PAID_FROM_LABELS[paidFrom]}. Change`}
    >
      <Icon name="wallet" size={14} color={colors.textPrimary} />
      <Text style={styles.pillText} numberOfLines={1}>
        From: {PAID_FROM_LABELS[paidFrom]}
      </Text>
      <Icon name="chevron-down" size={12} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

export function PaidFromChoices({
  value,
  onPick,
}: {
  value: Exclude<PaidFrom, "drawer">;
  onPick: (next: Exclude<PaidFrom, "drawer">) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
      {PICKABLE_PAID_FROM.map((source) => (
        <Chip key={source} label={PAID_FROM_LABELS[source]} isOn={source === value} onPress={() => onPick(source)} />
      ))}
    </ScrollView>
  );
}

// ── Chips ─────────────────────────────────────────────────────────────────

export function Chip({
  label,
  isOn = false,
  onPress,
  icon,
  isDashed = false,
  accessibilityLabel,
  style,
}: {
  label: string;
  isOn?: boolean;
  onPress: () => void;
  icon?: IconName;
  isDashed?: boolean;
  accessibilityLabel?: string;
  style?: object;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, isDashed && styles.chipDashed, isOn && styles.chipOn, style]}
      accessibilityRole="button"
      accessibilityState={{ selected: isOn }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {isOn ? <Icon name="check" size={13} color={colors.textOnDark} /> : null}
      {!isOn && icon ? <Icon name={icon} size={13} color={colors.textSecondary} /> : null}
      <Text style={[styles.chipText, isOn && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function RepeatRow({
  suggestions,
  onPick,
}: {
  suggestions: readonly RepeatSuggestion[];
  onPick: (suggestion: RepeatSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
      {suggestions.map((suggestion) => (
        <Chip
          key={`${suggestion.categoryId}|${suggestion.amountCents}`}
          label={`${shortName(suggestion.categoryName)} ${formatPeso(suggestion.amountCents)}`}
          icon="rotate"
          isDashed
          onPress={() => onPick(suggestion)}
          accessibilityLabel={`Repeat: ${shortName(suggestion.categoryName)}, ${formatPeso(suggestion.amountCents)}`}
        />
      ))}
    </ScrollView>
  );
}

/** Two rows of four: the top categories, the chosen one always visible, then More…. */
export function CategoryGrid({
  ranked,
  selectedId,
  onPick,
  onMore,
}: {
  ranked: readonly ExpenseCategory[];
  selectedId: string | null;
  onPick: (category: ExpenseCategory) => void;
  onMore: () => void;
}) {
  const shown = ranked.slice(0, 7);
  const selected = selectedId ? ranked.find((category) => category.id === selectedId) : undefined;
  const cells = selected && !shown.includes(selected) ? [...shown.slice(0, 6), selected] : shown;
  return (
    <View style={styles.grid}>
      {cells.map((category) => (
        <Chip
          key={category.id}
          label={shortName(category.name)}
          isOn={category.id === selectedId}
          onPress={() => onPick(category)}
          accessibilityLabel={category.name}
          style={styles.gridCell}
        />
      ))}
      <Chip label="More…" icon="list" onPress={onMore} accessibilityLabel="More categories" style={styles.gridCell} />
    </View>
  );
}

/** Every category, grouped the way the owner reads them (no accounting words). */
export function AllCategories({
  categories,
  selectedId,
  onPick,
  onBack,
}: {
  categories: readonly ExpenseCategory[];
  selectedId: string | null;
  onPick: (category: ExpenseCategory) => void;
  onBack: () => void;
}) {
  const groups = EXPENSE_GROUPS.map((group: ExpenseGroup) => ({
    group,
    items: sortCategories(categories.filter((category) => category.group === group && category.archivedAt === null)),
  })).filter((section) => section.items.length > 0);
  return (
    <View style={styles.all}>
      <TouchableOpacity onPress={onBack} style={styles.backRow} accessibilityRole="button" accessibilityLabel="Back to the amount">
        <Icon name="chevron-left" size={18} color={colors.textPrimary} />
        <Text style={styles.backText}>All categories</Text>
      </TouchableOpacity>
      <ScrollView style={styles.allScroll} keyboardShouldPersistTaps="handled">
        {groups.map((section) => (
          <View key={section.group} style={styles.allGroup}>
            <Text style={styles.groupTitle}>{GROUP_LABELS[section.group]}</Text>
            {section.items.map((category) => {
              const isOn = category.id === selectedId;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={styles.allRow}
                  onPress={() => onPick(category)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isOn }}
                  accessibilityLabel={category.name}
                >
                  <CategoryBadge code={category.icon ?? category.name.slice(0, 2)} size={32} />
                  <Text style={styles.allName}>{category.name}</Text>
                  {isOn ? <Icon name="check" size={18} color={colors.textPrimary} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ── The folded row: receipt · note · date · paid to ───────────────────────

export type FoldPanel = "note" | "date" | "paidTo" | "source" | null;

export function FoldedRow({
  hasReceipt,
  note,
  noteRequired,
  dateLabel,
  canPickDate,
  paidTo,
  open,
  onReceipt,
  onOpen,
}: {
  hasReceipt: boolean;
  note: string;
  noteRequired: boolean;
  dateLabel: string;
  canPickDate: boolean;
  paidTo: string;
  open: FoldPanel;
  onReceipt: () => void;
  onOpen: (panel: FoldPanel) => void;
}) {
  const toggle = (panel: Exclude<FoldPanel, null>) => onOpen(open === panel ? null : panel);
  return (
    <View style={styles.folded}>
      <FoldButton icon="photo" label={hasReceipt ? "Receipt added" : "Receipt"} isDone={hasReceipt} onPress={onReceipt} />
      <FoldButton
        icon="edit"
        label={note.trim() ? "Note added" : noteRequired ? "Note needed" : "Note"}
        isDone={note.trim().length > 0}
        isWarn={noteRequired && !note.trim()}
        isOpen={open === "note"}
        onPress={() => toggle("note")}
      />
      <FoldButton
        icon="calendar"
        label={dateLabel}
        isOpen={open === "date"}
        onPress={canPickDate ? () => toggle("date") : undefined}
      />
      <FoldButton
        icon="account"
        label={paidTo.trim() ? shortName(paidTo.trim()) : "Paid to"}
        isDone={paidTo.trim().length > 0}
        isOpen={open === "paidTo"}
        onPress={() => toggle("paidTo")}
      />
    </View>
  );
}

function FoldButton({
  icon,
  label,
  isDone = false,
  isWarn = false,
  isOpen = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  isDone?: boolean;
  isWarn?: boolean;
  isOpen?: boolean;
  onPress?: () => void;
}) {
  const tint = isWarn || isDone ? colors.textPrimary : colors.textMuted;
  return (
    <TouchableOpacity
      style={[styles.fold, isOpen && styles.foldOpen]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: isOpen, disabled: !onPress }}
      accessibilityLabel={label}
    >
      <Icon name={isDone ? "check" : icon} size={16} color={tint} />
      <Text style={[styles.foldText, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function FoldInput({
  value,
  onChange,
  placeholder,
  maxLength,
  accessibilityLabel,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  maxLength: number;
  accessibilityLabel: string;
}) {
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
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export function DateChoices({
  dates,
  value,
  onPick,
}: {
  dates: readonly string[];
  value: string;
  onPick: (date: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
      {dates.map((date) => (
        <Chip key={date} label={dayLabel(date)} isOn={date === value} onPress={() => onPick(date)} />
      ))}
    </ScrollView>
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

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.separator,
    maxWidth: 220,
  },
  pillText: { ...typography.caption, fontWeight: "700", color: colors.textPrimary, flexShrink: 1 },
  pillLocked: { backgroundColor: colors.successLight, borderColor: colors.successLight },
  pillLockedText: { ...typography.caption, fontWeight: "700", color: colors.success, flexShrink: 1 },

  scrollRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.surfaceSubtle,
  },
  chipDashed: { backgroundColor: "transparent", borderColor: colors.separator, borderStyle: "dashed" },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
  chipTextOn: { color: colors.textOnDark, fontWeight: "700" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  gridCell: { width: "23.5%", paddingHorizontal: 6 },

  all: { flex: 1 },
  allScroll: { flex: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44 },
  backText: { ...typography.heading, color: colors.textPrimary },
  allGroup: { marginTop: spacing.md },
  groupTitle: { ...typography.caption, fontWeight: "700", color: colors.textMuted, marginBottom: spacing.xs },
  allRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  allName: { ...typography.body, color: colors.textPrimary, flex: 1 },

  folded: { flexDirection: "row", gap: spacing.xs },
  fold: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 40,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
  },
  foldOpen: { backgroundColor: colors.surfaceSubtle },
  foldText: { ...typography.small, fontWeight: "700", flexShrink: 1 },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
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
});
