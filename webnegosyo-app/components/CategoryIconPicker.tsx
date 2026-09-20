/**
 * The sheet where a merchant picks the icon their customers will see.
 *
 * It edits a DRAFT. Tapping around in here changes nothing about the category
 * until "Apply" — closing leaves the category exactly as it was, which is what
 * a merchant who opened the sheet to look around expects.
 *
 * One column stores both shapes an icon can take — a curated `lucide:<name>`
 * and, for stores set up before the library existed, a raw emoji — so the two
 * are mutually exclusive here: choosing one clears the other. A leftover emoji
 * sitting behind a freshly tapped icon would be the value that actually saved.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { colors, typography, spacing, radius } from "../theme/colors";
import { CategoryIcon } from "./CategoryIcon";
import {
  isLucideIcon,
  toLucideIconString,
  isValidCategoryIconColor,
} from "../lib/category-icon-catalog";
import {
  ALL_GROUP_LABEL,
  iconGroupLabels,
  filterCuratedIcons,
} from "../lib/category-icon-search";

const PREVIEW_SIZE = 26;
const TILE_ICON_SIZE = 20;
const GRID_COLUMNS = 6;
const MAX_HEX_LENGTH = 7;
const MAX_EMOJI_LENGTH = 4;
/** Two hex digits appended to a colour, i.e. ~7% and ~19% opacity. */
const TINT_ALPHA = "14";
const BORDER_ALPHA = "33";

interface CategoryIconPickerProps {
  visible: boolean;
  /** The icon the category currently has: `lucide:<name>`, an emoji, or "". */
  icon: string;
  /** The category's icon colour as `#RRGGBB`, or "" to use the app accent. */
  color: string;
  onApply: (icon: string, color: string) => void;
  onClose: () => void;
}

const GROUP_LABELS = iconGroupLabels();

export function CategoryIconPicker({
  visible,
  icon,
  color,
  onApply,
  onClose,
}: CategoryIconPickerProps) {
  const [draftIcon, setDraftIcon] = useState(icon);
  const [draftColor, setDraftColor] = useState(color);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState(ALL_GROUP_LABEL);
  const [isEmojiMode, setIsEmojiMode] = useState(Boolean(icon) && !isLucideIcon(icon));
  const [colorError, setColorError] = useState("");

  // Re-seeding on open is what makes the sheet a draft: a merchant who backed
  // out last time must not find their abandoned choice waiting for them.
  useEffect(() => {
    if (!visible) return;
    setDraftIcon(icon);
    setDraftColor(color);
    setSearch("");
    setGroup(ALL_GROUP_LABEL);
    setIsEmojiMode(Boolean(icon) && !isLucideIcon(icon));
    setColorError("");
  }, [visible, icon, color]);

  const visibleIcons = useMemo(
    () => filterCuratedIcons(group, search),
    [group, search],
  );

  const tint = draftColor && isValidCategoryIconColor(draftColor)
    ? draftColor
    : colors.accent;

  const selectCuratedIcon = (name: string) => {
    setDraftIcon(toLucideIconString(name));
    setIsEmojiMode(false);
  };

  const handleApply = () => {
    if (draftColor && !isValidCategoryIconColor(draftColor)) {
      setColorError("Use a hex colour like #FF6B00, or leave it blank.");
      return;
    }
    onApply(draftIcon, draftColor);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropFill}
          onPress={onClose}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close icon picker"
        />

        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>Choose icon</Text>
            {draftIcon !== "" && (
              <TouchableOpacity
                onPress={() => setDraftIcon("")}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Clear the icon"
              >
                <Text style={styles.clear}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.previewRow}>
            <View
              testID="icon-preview"
              style={[
                styles.preview,
                { backgroundColor: `${tint}${TINT_ALPHA}`, borderColor: `${tint}${BORDER_ALPHA}` },
              ]}
            >
              <CategoryIcon
                icon={draftIcon}
                color={tint}
                size={PREVIEW_SIZE}
                fallback="placeholder"
              />
            </View>

            <View style={styles.colorFields}>
              <Text style={styles.fieldLabel}>Colour</Text>
              <TextInput
                testID="icon-color-input"
                style={styles.colorInput}
                value={draftColor}
                onChangeText={(next) => {
                  setDraftColor(next);
                  setColorError("");
                }}
                placeholder="Brand default"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={MAX_HEX_LENGTH}
              />
            </View>
          </View>

          {colorError !== "" && <Text style={styles.error}>{colorError}</Text>}

          <View style={styles.searchRow}>
            <TextInput
              testID="icon-search-input"
              style={styles.searchInput}
              value={search}
              onChangeText={(next) => {
                setSearch(next);
                setIsEmojiMode(false);
              }}
              placeholder="Search icons"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              testID="icon-emoji-toggle"
              style={[styles.emojiToggle, isEmojiMode && styles.emojiToggleActive]}
              onPress={() => setIsEmojiMode(!isEmojiMode)}
              accessibilityRole="button"
              accessibilityLabel="Use an emoji instead"
              accessibilityState={{ selected: isEmojiMode }}
            >
              <Text
                style={[styles.emojiToggleText, isEmojiMode && styles.emojiToggleTextActive]}
              >
                Emoji
              </Text>
            </TouchableOpacity>
          </View>

          {isEmojiMode ? (
            <View style={styles.emojiPanel}>
              <Text style={styles.emojiHint}>Type or paste an emoji</Text>
              <TextInput
                testID="icon-emoji-input"
                style={styles.emojiInput}
                value={isLucideIcon(draftIcon) ? "" : draftIcon}
                onChangeText={setDraftIcon}
                placeholder="🍕"
                placeholderTextColor={colors.textTertiary}
                maxLength={MAX_EMOJI_LENGTH}
              />
            </View>
          ) : (
            <>
              <ScrollView
                horizontal
                style={styles.chipsScroll}
                contentContainerStyle={styles.chips}
                showsHorizontalScrollIndicator={false}
              >
                {GROUP_LABELS.map((label) => (
                  <TouchableOpacity
                    key={label}
                    style={[styles.chip, group === label && styles.chipActive]}
                    onPress={() => setGroup(label)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: group === label }}
                  >
                    <Text
                      style={[styles.chipText, group === label && styles.chipTextActive]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <ScrollView style={styles.grid} showsVerticalScrollIndicator={false}>
                {visibleIcons.length === 0 ? (
                  <Text style={styles.empty}>No icons match “{search.trim()}”</Text>
                ) : (
                  <View style={styles.gridInner}>
                    {visibleIcons.map((name) => {
                      const isSelected = draftIcon === toLucideIconString(name);
                      return (
                        <TouchableOpacity
                          key={name}
                          testID={`icon-option-${name}`}
                          style={[
                            styles.tile,
                            isSelected && { backgroundColor: tint, borderColor: tint },
                          ]}
                          onPress={() => selectCuratedIcon(name)}
                          accessibilityRole="button"
                          accessibilityLabel={name.replace(/-/g, " ")}
                          accessibilityState={{ selected: isSelected }}
                        >
                          <CategoryIcon
                            icon={toLucideIconString(name)}
                            color={isSelected ? colors.textOnDark : tint}
                            size={TILE_ICON_SIZE}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            </>
          )}

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.action, styles.cancel]}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.action, styles.apply]}
              onPress={handleApply}
              accessibilityRole="button"
            >
              <Text style={styles.applyText}>Apply</Text>
            </TouchableOpacity>
          </View>
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
    paddingBottom: 40,
    maxHeight: "88%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.separator,
    marginBottom: spacing.lg,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { ...typography.title, color: colors.textPrimary },
  clear: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },

  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  preview: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  colorFields: { flex: 1 },
  fieldLabel: {
    ...typography.small,
    color: colors.textPrimary,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  colorInput: {
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  emojiToggle: {
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiToggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  emojiToggleText: { ...typography.small, color: colors.textPrimary, fontWeight: "700" },
  emojiToggleTextActive: { color: colors.textOnDark },

  emojiPanel: {
    marginTop: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  emojiHint: { ...typography.caption, color: colors.textPrimary, marginBottom: spacing.md },
  emojiInput: {
    width: 110,
    height: 60,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surfaceSubtle,
    textAlign: "center",
    fontSize: 30,
    color: colors.textPrimary,
  },

  chipsScroll: { flexGrow: 0, marginTop: spacing.lg },
  chips: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.primaryLight,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.small, color: colors.textPrimary, fontWeight: "700" },
  chipTextActive: { color: colors.textOnDark },

  grid: { marginTop: spacing.md, flexGrow: 0 },
  gridInner: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: {
    width: `${100 / GRID_COLUMNS}%`,
    aspectRatio: 1,
    flexGrow: 0,
    flexBasis: "13%",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    ...typography.caption,
    color: colors.textPrimary,
    textAlign: "center",
    paddingVertical: spacing.xxl,
  },

  footer: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  action: {
    flex: 1,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  cancel: { borderWidth: 1, borderColor: colors.separator, backgroundColor: colors.card },
  cancelText: { ...typography.body, color: colors.textPrimary, fontWeight: "700" },
  apply: { backgroundColor: colors.primary },
  applyText: { ...typography.body, color: colors.textOnDark, fontWeight: "700" },
});
