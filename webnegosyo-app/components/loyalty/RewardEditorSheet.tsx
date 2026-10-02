import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { describeReward, parseRewardDraft, rewardEmoji, type RewardDraft } from "../../lib/loyalty/programs";
import { REWARD_EMOJIS } from "../../lib/loyalty/wizard";
import type { Product } from "../../lib/products";
import { colors, radius, spacing, typography } from "../../theme/colors";
import { RewardIcon } from "./RewardIcon";

/**
 * Put one reward on one slot of the card. Opens from a tap on the slot, so the
 * merchant always knows WHERE on the card the reward will sit.
 */

interface RewardEditorSheetProps {
  isVisible: boolean;
  at: number;
  unit: "stamp" | "point";
  isFinal: boolean;
  initial: RewardDraft;
  products: Product[];
  catalogError: string | null;
  onSave: (draft: RewardDraft) => void;
  /** Absent for the big reward — a card always has one. */
  onRemove?: () => void;
  onClose: () => void;
}

const TYPES: { type: RewardDraft["type"]; emoji: string; label: string }[] = [
  { type: "free_item", emoji: "🎁", label: "Free item" },
  { type: "fixed", emoji: "💸", label: "₱ off" },
  { type: "percent", emoji: "🏷️", label: "% off" },
];

const MAX_ITEMS_SHOWN = 30;

export function RewardEditorSheet({
  isVisible,
  at,
  unit,
  isFinal,
  initial,
  products,
  catalogError,
  onSave,
  onRemove,
  onClose,
}: RewardEditorSheetProps) {
  const [draft, setDraft] = useState<RewardDraft>(initial);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Each opening starts from the slot's own reward, never the last one edited.
  useEffect(() => {
    if (!isVisible) return;
    setDraft(initial);
    setQuery("");
    setError(null);
  }, [isVisible, initial]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle ? products.filter(product => product.name.toLowerCase().includes(needle)) : products;
    return list.slice(0, MAX_ITEMS_SHOWN);
  }, [products, query]);

  const parsed = parseRewardDraft(draft);
  const preview = parsed.ok
    ? { emoji: rewardEmoji(parsed.reward), label: describeReward(parsed.reward), imageUrl: parsed.reward.type === "free_item" ? parsed.reward.imageUrl ?? null : null }
    : { emoji: draft.emoji || TYPES.find(option => option.type === draft.type)!.emoji, label: "Finish setting up this reward", imageUrl: null };

  const save = () => {
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onSave(draft);
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <TouchableOpacity style={styles.scrim} accessibilityLabel="Close" onPress={onClose} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <Text style={styles.eyebrow}>{isFinal ? "🏆 The big reward" : "Reward on the way"}</Text>
          <Text style={styles.title}>At {unit} {at}, customers get…</Text>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.previewRow}>
              <RewardIcon emoji={preview.emoji} imageUrl={preview.imageUrl} size={56} ringColor={colors.tabBarActive} />
              <Text style={[styles.previewLabel, !parsed.ok && styles.previewMuted]}>{preview.label}</Text>
            </View>

            <View style={styles.tiles}>
              {TYPES.map(option => {
                const isActive = draft.type === option.type;
                return (
                  <TouchableOpacity
                    key={option.type}
                    style={[styles.tile, isActive && styles.tileActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => setDraft({ ...draft, type: option.type })}
                  >
                    <Text style={styles.tileEmoji}>{option.emoji}</Text>
                    <Text style={[styles.tileLabel, isActive && styles.tileLabelActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {draft.type === "free_item" ? (
              <View style={styles.section}>
                <TextInput
                  style={styles.input}
                  placeholder="Search your menu"
                  placeholderTextColor={colors.textTertiary}
                  value={query}
                  onChangeText={setQuery}
                  accessibilityLabel="Search menu items"
                />
                {catalogError ? <Text style={styles.error}>{catalogError}</Text> : null}
                <View style={styles.items}>
                  {matches.map(product => {
                    const isPicked = draft.itemId === product.id;
                    return (
                      <TouchableOpacity
                        key={product.id}
                        style={[styles.item, isPicked && styles.itemPicked]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isPicked }}
                        accessibilityLabel={product.name}
                        onPress={() => setDraft({
                          ...draft,
                          itemId: product.id,
                          itemName: product.name,
                          imageUrl: product.image_url?.startsWith("https://") ? product.image_url : "",
                        })}
                      >
                        {product.image_url ? (
                          <Image source={{ uri: product.image_url }} style={styles.itemPhoto} alt="" />
                        ) : (
                          <View style={[styles.itemPhoto, styles.itemPhotoEmpty]}><Text style={styles.tileEmoji}>🍽️</Text></View>
                        )}
                        <Text style={styles.itemName} numberOfLines={2}>{product.name}</Text>
                        {isPicked ? <Text style={styles.itemCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {matches.length === 0 && !catalogError ? <Text style={styles.hint}>No menu items match.</Text> : null}
                <Text style={styles.hint}>One base item is free. Upgrades and add-ons stay payable.</Text>
              </View>
            ) : (
              <View style={styles.section}>
                <View style={styles.amountRow}>
                  <Text style={styles.amountAffix}>{draft.type === "fixed" ? "₱" : ""}</Text>
                  <TextInput
                    style={styles.amount}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                    value={draft.value}
                    onChangeText={value => setDraft({ ...draft, value })}
                    accessibilityLabel={draft.type === "fixed" ? "Amount off in pesos" : "Percent off"}
                  />
                  <Text style={styles.amountAffix}>{draft.type === "percent" ? "% off" : "off"}</Text>
                </View>
                {draft.type === "percent" ? (
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    placeholder="Cap in ₱ (optional)"
                    placeholderTextColor={colors.textTertiary}
                    value={draft.cap}
                    onChangeText={cap => setDraft({ ...draft, cap })}
                    accessibilityLabel="Maximum discount in pesos"
                  />
                ) : null}
              </View>
            )}

            <Text style={styles.sectionLabel}>Icon on the card</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojis}>
              {REWARD_EMOJIS.map(emoji => {
                const isPicked = draft.emoji === emoji;
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.emoji, isPicked && styles.emojiPicked]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isPicked }}
                    accessibilityLabel={`Icon ${emoji}`}
                    onPress={() => setDraft({ ...draft, emoji: isPicked ? "" : emoji })}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {draft.type === "free_item" && draft.imageUrl ? <Text style={styles.hint}>The item’s photo shows on the card; the icon is used where photos can’t load.</Text> : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.actions}>
            {onRemove ? (
              <TouchableOpacity style={styles.ghost} onPress={onRemove} accessibilityRole="button">
                <Text style={styles.ghostLabel}>Remove</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.primary} onPress={save} accessibilityRole="button">
              <Text style={styles.primaryLabel}>Put it on the card</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(29,24,21,0.45)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    maxHeight: "88%",
    gap: spacing.xs,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.separator, marginBottom: spacing.sm },
  eyebrow: { ...typography.eyebrow, color: colors.accent },
  title: { ...typography.title, fontSize: 21, color: colors.textPrimary },
  body: { gap: spacing.md, paddingVertical: spacing.md },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  previewLabel: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  previewMuted: { color: colors.textSecondary },
  tiles: { flexDirection: "row", gap: spacing.sm },
  tile: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.separator,
    backgroundColor: colors.card,
  },
  tileActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  tileEmoji: { fontSize: 24 },
  tileLabel: { ...typography.caption, fontWeight: "700", color: colors.textSecondary },
  tileLabelActive: { color: colors.accent },
  section: { gap: spacing.sm },
  sectionLabel: { ...typography.eyebrow, color: colors.textSecondary },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  items: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  item: {
    width: "31%",
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: colors.surfaceSubtle,
    padding: 6,
    gap: 4,
  },
  itemPicked: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  itemPhoto: { width: "100%", aspectRatio: 1, borderRadius: radius.md },
  itemPhotoEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  itemName: { ...typography.small, fontWeight: "700", color: colors.textPrimary },
  itemCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    textAlign: "center",
    lineHeight: 22,
    fontWeight: "800",
    color: colors.textOnDark,
    backgroundColor: colors.accent,
  },
  amountRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  amount: { fontSize: 44, fontWeight: "800", color: colors.textPrimary, minWidth: 90, textAlign: "center" },
  amountAffix: { ...typography.heading, color: colors.textSecondary },
  emojis: { gap: spacing.xs },
  emoji: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 2,
    borderColor: "transparent",
  },
  emojiPicked: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  emojiText: { fontSize: 24 },
  hint: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  actions: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.sm },
  primary: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.full, paddingVertical: 14, alignItems: "center" },
  primaryLabel: { ...typography.body, fontWeight: "800", color: colors.textOnDark },
  ghost: { backgroundColor: colors.surfaceSubtle, borderRadius: radius.full, paddingVertical: 14, paddingHorizontal: spacing.xl, alignItems: "center" },
  ghostLabel: { ...typography.body, fontWeight: "700", color: colors.danger },
});
