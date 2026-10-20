import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { colors, spacing, radius } from "../../theme/colors";
import { RecipeSheet } from "./RecipeSheet";
import type { UnitOption } from "../../lib/recipe-service";
import { compatibleRecipeUnits } from "../../lib/recipe-line-rules";

interface UnitPickerSheetProps {
  /** The ingredient whose unit is being chosen; null = closed. */
  ingredientName: string | null;
  units: readonly UnitOption[];
  selectedUnitId: string | null;
  /** The unit the ingredient is stocked in, marked so it is the obvious pick. */
  stockUnitId: string | null;
  onPick: (unitId: string) => void;
  onClose: () => void;
}

/**
 * The unit for one recipe line, chosen from a grid instead of a strip of
 * every unit squeezed beside each amount. The stock unit is labelled: it is
 * the one that never needs converting.
 *
 * Only units that convert to the stock unit are offered (weight ↔ volume
 * converts 1:1; a count never converts to either): a line in any other unit
 * would save and then never deduct.
 */
export function UnitPickerSheet({
  ingredientName,
  units,
  selectedUnitId,
  stockUnitId,
  onPick,
  onClose,
}: UnitPickerSheetProps) {
  const offered = compatibleRecipeUnits(stockUnitId, units);
  return (
    <RecipeSheet
      visible={ingredientName !== null}
      title="Unit"
      subtitle={ingredientName ? `How ${ingredientName} is measured in this recipe.` : undefined}
      onClose={onClose}
    >
      <ScrollView contentContainerStyle={styles.grid}>
        {offered.map((unit) => {
          const isSelected = unit.id === selectedUnitId;
          const isStock = unit.id === stockUnitId;
          return (
            <TouchableOpacity
              key={unit.id}
              style={[styles.tile, isSelected && styles.tileSelected]}
              onPress={() => onPick(unit.id)}
              accessibilityRole="button"
              accessibilityLabel={isStock ? `${unit.abbreviation}, stock unit` : unit.abbreviation}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.tileText, isSelected && styles.tileTextSelected]} numberOfLines={1}>
                {unit.abbreviation}
              </Text>
              {isStock && (
                <Text style={[styles.stockTag, isSelected && styles.stockTagSelected]}>Stock unit</Text>
              )}
            </TouchableOpacity>
          );
        })}
        {offered.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No units set up yet. Add them on the Inventory screen.</Text>
          </View>
        )}
      </ScrollView>
    </RecipeSheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingBottom: spacing.sm },
  tile: {
    minWidth: 76,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  tileSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tileText: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  tileTextSelected: { color: colors.textOnDark },
  stockTag: { fontSize: 10, fontWeight: "700", color: colors.success, marginTop: 2, textTransform: "uppercase" },
  stockTagSelected: { color: colors.heroInkMuted },
  empty: { padding: spacing.lg },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: "center" },
});
