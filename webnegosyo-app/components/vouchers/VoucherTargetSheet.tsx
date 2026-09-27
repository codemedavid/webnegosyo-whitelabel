import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { colors, radius, spacing, typography } from "../../theme/colors";
import { Icon } from "../Icon";
import {
  filterTargetOptions,
  summarizeTargetSelection,
  toggleTargetId,
  type TargetOption,
} from "../../lib/vouchers/target-picker";

/**
 * Pick which products (or categories) a scoped voucher touches.
 *
 * The sheet holds its own draft and hands it back on Done, so backing out
 * with the backdrop or the hardware back button changes nothing — a merchant
 * who opened it by accident loses no selection. Products are grouped under
 * their category and searchable by either name, because "the iced drinks" is
 * how a merchant thinks of a promotion, not as eleven separate rows.
 */

interface VoucherTargetSheetProps {
  visible: boolean;
  kind: "products" | "categories";
  options: readonly TargetOption[];
  selected: readonly string[];
  onClose: () => void;
  onDone: (ids: string[]) => void;
}

interface Section {
  title: string;
  data: TargetOption[];
}

const UNGROUPED = "Other";

function toSections(options: readonly TargetOption[], kind: VoucherTargetSheetProps["kind"]): Section[] {
  if (kind === "categories") return options.length > 0 ? [{ title: "", data: [...options] }] : [];
  const groups = new Map<string, TargetOption[]>();
  for (const option of options) {
    const title = option.group ?? UNGROUPED;
    groups.set(title, [...(groups.get(title) ?? []), option]);
  }
  return [...groups.entries()].map(([title, data]) => ({ title, data }));
}

export function VoucherTargetSheet({
  visible,
  kind,
  options,
  selected,
  onClose,
  onDone,
}: VoucherTargetSheetProps) {
  const [draft, setDraft] = useState<readonly string[]>(selected);
  const [query, setQuery] = useState("");

  // Each opening starts from what the form holds, not from the last visit.
  useEffect(() => {
    if (visible) {
      setDraft(selected);
      setQuery("");
    }
  }, [visible, selected]);

  const sections = useMemo(
    () => toSections(filterTargetOptions(options, query), kind),
    [options, query, kind],
  );
  const summary = summarizeTargetSelection(draft, options);
  const noun = kind === "categories" ? "categories" : "products";
  const draftSet = new Set(draft);

  const toggleSection = (section: Section) => {
    const ids = section.data.map((option) => option.id);
    const isAllOn = ids.every((id) => draftSet.has(id));
    setDraft((prev) =>
      isAllOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropFill}
          onPress={onClose}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close without changing"
        />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Choose {noun}</Text>
            <TouchableOpacity
              onPress={() => setDraft([])}
              disabled={draft.length === 0}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Clear selection"
              accessibilityState={{ disabled: draft.length === 0 }}
            >
              <Text style={[styles.clear, draft.length === 0 && styles.clearDisabled]}>Clear</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.search}>
            <Icon name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={kind === "categories" ? "Search categories" : "Search products or categories"}
              placeholderTextColor={colors.textTertiary}
              autoCorrect={false}
              clearButtonMode="while-editing"
              accessibilityLabel={`Search ${noun}`}
            />
          </View>

          {summary.missingIds.length > 0 ? (
            <TouchableOpacity
              style={styles.missing}
              onPress={() => setDraft((prev) => prev.filter((id) => !summary.missingIds.includes(id)))}
              accessibilityRole="button"
            >
              <Icon name="warning" size={16} color={colors.statusPending.text} />
              <Text style={styles.missingText}>
                {summary.missingIds.length} picked {summary.missingIds.length === 1 ? "item was" : "items were"} deleted
                from your menu. Tap to remove.
              </Text>
            </TouchableOpacity>
          ) : null}

          <SectionList
            style={styles.list}
            sections={sections}
            keyExtractor={(option) => option.id}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {options.length === 0 ? `You have no ${noun} yet.` : `No ${noun} match “${query}”.`}
              </Text>
            }
            renderSectionHeader={({ section }) =>
              section.title ? (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <TouchableOpacity
                    onPress={() => toggleSection(section)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Select all in ${section.title}`}
                  >
                    <Text style={styles.sectionAction}>
                      {section.data.every((o) => draftSet.has(o.id)) ? "None" : "All"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const isChecked = draftSet.has(item.id);
              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setDraft((prev) => toggleTargetId(prev, item.id))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  accessibilityLabel={item.label}
                >
                  <View style={[styles.checkbox, isChecked && styles.checkboxOn]}>
                    {isChecked ? <Icon name="check" size={14} color={colors.textOnDark} strokeWidth={2.5} /> : null}
                  </View>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />

          <TouchableOpacity
            style={styles.done}
            onPress={() => onDone([...draft])}
            accessibilityRole="button"
            accessibilityLabel={`Use ${summary.selectedCount} ${noun}`}
          >
            <Text style={styles.doneText}>
              {summary.selectedCount === 0 ? "Done" : `Use ${summary.selectedCount} selected`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(29,24,21,0.45)" },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: 36,
    height: "86%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    marginBottom: spacing.lg,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...typography.title, color: colors.textPrimary },
  clear: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  clearDisabled: { color: colors.textTertiary },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 46,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary },
  missing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  missingText: { ...typography.caption, color: colors.statusPending.text, flex: 1 },
  list: { flex: 1, marginTop: spacing.sm },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  sectionTitle: { ...typography.eyebrow, color: colors.textSecondary },
  sectionAction: { ...typography.caption, color: colors.textPrimary, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textTertiary,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rowLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xxl },
  done: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
  },
  doneText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
});
