import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuthStore } from "../../../../stores/auth-store";
import { hasPermission } from "../../../../lib/staff-permissions";
import {
  addRecipeComponent,
  ensureMenuItemRecipe,
  loadIngredientOptions,
  loadMenuItemRecipe,
  loadUnitOptions,
  removeRecipeComponent,
  updateRecipeComponent,
  type IngredientOption,
  type MenuItemRecipe,
  type UnitOption,
} from "../../../../lib/recipe-service";
import { colors, typography, spacing, radius } from "../../../../theme/colors";
import { Card } from "../../../../components/Card";
import { LoadingState } from "../../../../components/LoadingState";
import { ErrorState } from "../../../../components/ErrorState";

/**
 * The recipe (ingredients) editor for one dish.
 *
 * This is the write path that makes deduction real for an app-first merchant:
 * a sale only moves stock when the dish has a recipe, and until this screen
 * the app could show the shelf but never wire a dish to it. All data access
 * lives in lib/recipe-service.ts; this screen only arranges it.
 *
 * MVP scope: the BASE recipe of the menu item. Variation- and addon-level
 * recipes are a later iteration.
 */
export default function RecipeEditorScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const tenantId = useAuthStore((s) => s.tenantId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);

  // Rewiring what a sale deducts is a menu decision, so it rides the same
  // "menu" key that gates the inventory and product-management tabs. The tab
  // bar already hides those from an ungranted staffer, but this is a detail
  // route reachable by URL, so it refuses on its own as well.
  const isAllowed = hasPermission({ role, isOwner, permissions }, "menu");

  const [recipe, setRecipe] = useState<MenuItemRecipe | null>(null);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!tenantId || !productId) return;
    try {
      const [loadedRecipe, options, unitCatalog] = await Promise.all([
        loadMenuItemRecipe(tenantId, productId),
        loadIngredientOptions(tenantId),
        loadUnitOptions(tenantId),
      ]);
      setRecipe(loadedRecipe);
      setIngredients(options);
      setUnits(unitCatalog);
      setQuantityDrafts({});
      setError(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the recipe.");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const components = useMemo(() => recipe?.components ?? [], [recipe]);

  /** Ingredients not already on the recipe, narrowed by the search box. */
  const pickable = useMemo(() => {
    const used = new Set(components.map((line) => line.inventoryItemId));
    const needle = search.trim().toLowerCase();
    return ingredients.filter(
      (option) =>
        !used.has(option.id) && (needle === "" || option.name.toLowerCase().includes(needle)),
    );
  }, [ingredients, components, search]);

  const runSave = useCallback(
    async (work: () => Promise<void>) => {
      if (isSaving) return;
      setIsSaving(true);
      try {
        await work();
        await load();
      } catch (saveError: unknown) {
        Alert.alert(
          "Recipe",
          saveError instanceof Error ? saveError.message : "That did not save. Try again.",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, load],
  );

  const handleAdd = (option: IngredientOption) => {
    if (!tenantId || !productId) return;
    void runSave(async () => {
      const recipeId = recipe?.id ?? (await ensureMenuItemRecipe(tenantId, productId));
      await addRecipeComponent(tenantId, {
        recipeId,
        inventoryItemId: option.id,
        // 1 stock unit is a starting point the merchant is expected to edit,
        // not a guess at the real amount — but unlike zero it deducts.
        quantity: 1,
        unitId: option.stockUnitId ?? units[0]?.id ?? "",
        sortOrder: components.length,
      });
    });
    setIsPickerOpen(false);
    setSearch("");
  };

  const handleQuantityCommit = (componentId: string, unitId: string) => {
    if (!tenantId) return;
    const draft = quantityDrafts[componentId];
    if (draft === undefined) return;
    const quantity = Number(draft);
    void runSave(() => updateRecipeComponent(tenantId, componentId, { quantity, unitId }));
  };

  const handleUnitChange = (componentId: string, quantity: number, unitId: string) => {
    if (!tenantId) return;
    void runSave(() => updateRecipeComponent(tenantId, componentId, { quantity, unitId }));
  };

  const handleRemove = (componentId: string, name: string) => {
    if (!tenantId) return;
    Alert.alert("Remove ingredient", `Remove ${name || "this ingredient"} from the recipe?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => void runSave(() => removeRecipeComponent(tenantId, componentId)),
      },
    ]);
  };

  if (!isAllowed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.blockedText}>
          {"You don't have access to recipes. Ask the owner for the menu permission."}
        </Text>
      </View>
    );
  }

  if (!tenantId) return <LoadingState />;
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Ingredients</Text>
      <Text style={styles.subtitle}>
        What one sale of this product takes off the shelf.
      </Text>

      {components.length === 0 && (
        <Card style={styles.card}>
          <Text style={styles.hintTitle}>No recipe yet</Text>
          <Text style={styles.hintText}>
            {"Sales of this product won't deduct stock until you add its ingredients here."}
          </Text>
        </Card>
      )}

      {components.length > 0 && (
        <Card style={styles.card}>
          {components.map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <View style={styles.lineName}>
                <Text style={styles.lineNameText}>{line.ingredientName || "Ingredient"}</Text>
                <TouchableOpacity
                  onPress={() => handleRemove(line.id, line.ingredientName)}
                  disabled={isSaving}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.lineControls}>
                <TextInput
                  style={styles.quantityInput}
                  keyboardType="decimal-pad"
                  value={quantityDrafts[line.id] ?? String(line.quantity)}
                  onChangeText={(text) =>
                    setQuantityDrafts((drafts) => ({ ...drafts, [line.id]: text }))
                  }
                  onEndEditing={() => handleQuantityCommit(line.id, line.unitId)}
                  editable={!isSaving}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {units.map((unit) => (
                    <TouchableOpacity
                      key={unit.id}
                      style={[styles.unitPill, unit.id === line.unitId && styles.unitPillActive]}
                      disabled={isSaving || unit.id === line.unitId}
                      onPress={() => handleUnitChange(line.id, line.quantity, unit.id)}
                    >
                      <Text
                        style={[
                          styles.unitPillText,
                          unit.id === line.unitId && styles.unitPillTextActive,
                        ]}
                      >
                        {unit.abbreviation}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          ))}
        </Card>
      )}

      {isPickerOpen ? (
        <Card title="Add ingredient" style={styles.card}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search ingredients..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {pickable.length === 0 && (
            <Text style={styles.hintText}>
              {ingredients.length === 0
                ? "No ingredients in inventory yet. Add them on the Inventory tab first."
                : "Nothing matches. Every matching ingredient is already on the recipe."}
            </Text>
          )}
          {pickable.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.pickRow}
              disabled={isSaving}
              onPress={() => handleAdd(option)}
            >
              <Text style={styles.pickName}>{option.name}</Text>
              {option.unitLabel !== "" && (
                <Text style={styles.pickUnit}>per {option.unitLabel}</Text>
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setIsPickerOpen(false);
              setSearch("");
            }}
          >
            <Text style={styles.secondaryButtonText}>Close</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        <TouchableOpacity
          style={[styles.addButton, isSaving && styles.disabled]}
          disabled={isSaving}
          onPress={() => setIsPickerOpen(true)}
        >
          <Text style={styles.addButtonText}>+ Add ingredient</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  blockedText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  card: { marginBottom: spacing.lg },
  hintTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.xs },
  hintText: { ...typography.body, color: colors.textSecondary },
  lineRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  lineName: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  lineNameText: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  removeText: { ...typography.caption, color: colors.danger },
  lineControls: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  quantityInput: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 88,
    backgroundColor: colors.card,
  },
  unitPill: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
    backgroundColor: colors.card,
  },
  unitPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  unitPillText: { ...typography.caption, color: colors.textPrimary },
  unitPillTextActive: { color: colors.textOnDark },
  searchInput: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
  },
  pickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  pickName: { ...typography.body, color: colors.textPrimary, flex: 1 },
  pickUnit: { ...typography.caption, color: colors.textSecondary },
  secondaryButton: {
    marginTop: spacing.md,
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: { ...typography.heading, color: colors.textSecondary },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  addButtonText: { ...typography.heading, color: colors.textOnDark },
  disabled: { opacity: 0.6 },
});
