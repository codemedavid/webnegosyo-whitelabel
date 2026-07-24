import React from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch } from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";
import type { ModifierGroup } from "../lib/modifier-groups";
import {
  addGroup,
  removeGroup,
  updateGroup,
  addOption,
  removeOption,
  updateOption,
  moveOption,
  setGroupRequired,
  setGroupMultiple,
  groupSelectionMode,
} from "../lib/modifier-editor";

interface ModifierGroupsEditorProps {
  groups: ModifierGroup[];
  errors: Record<string, string>;
  onChange: (groups: ModifierGroup[]) => void;
  disabled?: boolean;
}

/** Parse a user-typed integer, clamped to >= 0. Empty/invalid → fallback. */
function parseCount(text: string, fallback: number): number {
  const n = parseInt(text, 10);
  return isNaN(n) || n < 0 ? fallback : n;
}

export function ModifierGroupsEditor({
  groups,
  errors,
  onChange,
  disabled,
}: ModifierGroupsEditorProps) {
  return (
    <View>
      <Text style={styles.sectionHint}>
        Variations (Size, Spice) and add-ons (Extra Cheese) are all option groups.
        A single-select group is a variation; allow multiple for add-ons.
      </Text>

      {groups.map((group) => {
        const mode = groupSelectionMode(group);
        const isMulti = mode === "multi";
        const error = errors[group.id];
        return (
          <View key={group.id} style={styles.group}>
            <View style={styles.groupHeader}>
              <TextInput
                style={styles.groupNameInput}
                value={group.name}
                onChangeText={(v) => onChange(updateGroup(groups, group.id, { name: v }))}
                placeholder="Group name (e.g. Size)"
                placeholderTextColor={colors.textTertiary}
                editable={!disabled}
              />
              <TouchableOpacity
                onPress={() => onChange(removeGroup(groups, group.id))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${group.name || "group"}`}
                disabled={disabled}
              >
                <Text style={styles.removeGroupText}>Remove</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.ruleRow}>
              <Text style={styles.ruleLabel}>Required</Text>
              <Switch
                value={group.min_select > 0}
                onValueChange={(v) => onChange(setGroupRequired(groups, group.id, v))}
                trackColor={{ false: colors.separator, true: colors.primary }}
                disabled={disabled}
              />
            </View>
            <View style={styles.ruleRow}>
              <Text style={styles.ruleLabel}>Allow multiple</Text>
              <Switch
                value={isMulti}
                onValueChange={(v) => onChange(setGroupMultiple(groups, group.id, v))}
                trackColor={{ false: colors.separator, true: colors.success }}
                disabled={disabled}
              />
            </View>

            {isMulti && (
              <View style={styles.minMaxRow}>
                <View style={styles.minMaxItem}>
                  <Text style={styles.smallLabel}>Min</Text>
                  <TextInput
                    style={styles.minMaxInput}
                    value={String(group.min_select)}
                    onChangeText={(v) =>
                      onChange(
                        updateGroup(groups, group.id, {
                          min_select: parseCount(v, 0),
                        })
                      )
                    }
                    keyboardType="number-pad"
                    editable={!disabled}
                  />
                </View>
                <View style={styles.minMaxItem}>
                  <Text style={styles.smallLabel}>Max (blank = unlimited)</Text>
                  <TextInput
                    style={styles.minMaxInput}
                    value={group.max_select === null ? "" : String(group.max_select)}
                    onChangeText={(v) =>
                      onChange(
                        updateGroup(groups, group.id, {
                          max_select: v.trim() === "" ? null : parseCount(v, 1),
                        })
                      )
                    }
                    keyboardType="number-pad"
                    placeholder="∞"
                    placeholderTextColor={colors.textTertiary}
                    editable={!disabled}
                  />
                </View>
              </View>
            )}

            {group.options.map((option, index) => (
              <View key={option.id} style={styles.optionRow}>
                <TextInput
                  style={styles.optionNameInput}
                  value={option.name}
                  onChangeText={(v) =>
                    onChange(updateOption(groups, group.id, option.id, { name: v }))
                  }
                  placeholder="Option (e.g. Large)"
                  placeholderTextColor={colors.textTertiary}
                  editable={!disabled}
                />
                <View style={styles.priceWrap}>
                  <Text style={styles.pricePrefix}>+₱</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={
                      option.price_modifier === 0 ? "" : String(option.price_modifier)
                    }
                    onChangeText={(v) => {
                      const n = parseFloat(v);
                      onChange(
                        updateOption(groups, group.id, option.id, {
                          price_modifier: isNaN(n) ? 0 : n,
                        })
                      );
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                    editable={!disabled}
                  />
                </View>
                <TouchableOpacity
                  onPress={() =>
                    onChange(moveOption(groups, group.id, index, index - 1))
                  }
                  disabled={disabled || index === 0}
                  accessibilityLabel="Move option up"
                >
                  <Text style={[styles.reorder, index === 0 && styles.reorderDisabled]}>
                    ↑
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    onChange(moveOption(groups, group.id, index, index + 1))
                  }
                  disabled={disabled || index === group.options.length - 1}
                  accessibilityLabel="Move option down"
                >
                  <Text
                    style={[
                      styles.reorder,
                      index === group.options.length - 1 && styles.reorderDisabled,
                    ]}
                  >
                    ↓
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onChange(removeOption(groups, group.id, option.id))}
                  disabled={disabled}
                  accessibilityLabel={`Remove ${option.name || "option"}`}
                >
                  <Text style={styles.removeOption}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.addOptionButton}
              onPress={() => onChange(addOption(groups, group.id))}
              disabled={disabled}
            >
              <Text style={styles.addOptionText}>+ Add option</Text>
            </TouchableOpacity>

            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>
        );
      })}

      <TouchableOpacity
        style={styles.addGroupButton}
        onPress={() => onChange(addGroup(groups))}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Add option group"
      >
        <Text style={styles.addGroupText}>+ Add option group</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHint: { ...typography.small, color: colors.textSecondary, marginBottom: spacing.md },
  group: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.background,
  },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  removeGroupText: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  ruleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  ruleLabel: { ...typography.caption, color: colors.textSecondary },
  minMaxRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  minMaxItem: { flex: 1 },
  smallLabel: { ...typography.small, color: colors.textTertiary, marginBottom: spacing.xs },
  minMaxInput: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.textPrimary,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  optionNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
  },
  priceWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    width: 80,
  },
  pricePrefix: { ...typography.small, color: colors.textSecondary },
  priceInput: { flex: 1, paddingVertical: spacing.sm, fontSize: 14, color: colors.textPrimary },
  reorder: { fontSize: 18, color: colors.textSecondary, paddingHorizontal: spacing.xs },
  reorderDisabled: { color: colors.separator },
  removeOption: { fontSize: 16, color: colors.danger, paddingHorizontal: spacing.xs },
  addOptionButton: { marginTop: spacing.sm, paddingVertical: spacing.sm },
  addOptionText: { ...typography.caption, color: colors.primary, fontWeight: "600" },
  errorText: { ...typography.small, color: colors.danger, marginTop: spacing.xs },
  addGroupButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  addGroupText: { ...typography.body, color: colors.primary, fontWeight: "700" },
});
