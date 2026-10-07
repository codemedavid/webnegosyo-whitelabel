import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from "react-native";
import { colors, typography, spacing, radius } from "../../theme/colors";
import { Icon } from "../Icon";
import { RecipeSheet } from "./RecipeSheet";
import { buildIngredientChoices } from "../../lib/recipe-editor";
import type { IngredientOption, RecipeComponentView } from "../../lib/recipe-service";

interface AddIngredientSheetProps {
  visible: boolean;
  ingredients: readonly IngredientOption[];
  components: readonly RecipeComponentView[];
  onPick: (option: IngredientOption) => void;
  onClose: () => void;
}

/**
 * "Which ingredient?" for a recipe. Search is focused on open — the merchant
 * already knows the name. Ingredients already on the recipe stay listed with
 * a check, so a search that finds them never reads as "not in inventory".
 */
export function AddIngredientSheet({
  visible,
  ingredients,
  components,
  onPick,
  onClose,
}: AddIngredientSheetProps) {
  const [query, setQuery] = useState("");
  const choices = useMemo(
    () => buildIngredientChoices(ingredients, components, query),
    [ingredients, components, query],
  );

  const close = () => {
    setQuery("");
    onClose();
  };

  const isInventoryEmpty = ingredients.length === 0;

  return (
    <RecipeSheet
      visible={visible}
      title="Add ingredient"
      subtitle="Pick what one sale of this product uses."
      onClose={close}
      height={isInventoryEmpty ? undefined : "78%"}
    >
      {isInventoryEmpty ? (
        <View style={styles.emptyBox}>
          <Icon name="stock" size={22} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No ingredients in inventory yet</Text>
          <Text style={styles.emptyText}>
            Add them on the Inventory screen first, then come back to build this recipe.
          </Text>
        </View>
      ) : (
        <>
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
            data={choices}
            keyExtractor={(choice) => choice.option.id}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <Text style={styles.noMatch}>{`No ingredient called "${query.trim()}".`}</Text>
            }
            renderItem={({ item: { option, isAdded } }) => (
              <TouchableOpacity
                style={styles.row}
                disabled={isAdded}
                onPress={() => {
                  setQuery("");
                  onPick(option);
                }}
                accessibilityRole="button"
                accessibilityLabel={isAdded ? `${option.name}, already added` : `Add ${option.name}`}
                accessibilityState={{ disabled: isAdded }}
              >
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowName, isAdded && styles.rowNameAdded]} numberOfLines={1}>
                    {option.name}
                  </Text>
                  {option.unitLabel !== "" && (
                    <Text style={styles.rowUnit}>Counted in {option.unitLabel}</Text>
                  )}
                </View>
                {isAdded ? (
                  <View style={styles.addedPill}>
                    <Icon name="check" size={13} color={colors.success} strokeWidth={2.25} />
                    <Text style={styles.addedText}>Added</Text>
                  </View>
                ) : (
                  <View style={styles.addCircle}>
                    <Icon name="plus" size={16} color={colors.textOnDark} strokeWidth={2.25} />
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
        </>
      )}
    </RecipeSheet>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary },
  list: { marginTop: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, flexGrow: 0 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 58,
  },
  rowCopy: { flex: 1, paddingVertical: spacing.sm },
  rowName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  rowNameAdded: { color: colors.textSecondary },
  rowUnit: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  addCircle: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.successLight,
  },
  addedText: { fontSize: 12, fontWeight: "700", color: colors.success },
  noMatch: { ...typography.caption, color: colors.textSecondary, textAlign: "center", padding: spacing.xl },
  emptyBox: {
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.sm, textAlign: "center" },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
});
