import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuthStore } from "../../../../stores/auth-store";
import { hasPermission } from "../../../../lib/staff-permissions";
import {
  addRecipeComponent,
  ensureMenuItemRecipe,
  loadDishName,
  loadIngredientOptions,
  loadMenuItemRecipe,
  loadUnitOptions,
  removeRecipeComponent,
  updateRecipeComponent,
  type IngredientOption,
  type MenuItemRecipe,
  type RecipeComponentView,
  type UnitOption,
} from "../../../../lib/recipe-service";
import { colors, typography, spacing, radius, shadow } from "../../../../theme/colors";
import { BackHeader } from "../../../../components/BackHeader";
import { Button } from "../../../../components/Button";
import { Icon, type IconName } from "../../../../components/Icon";
import { LoadingState } from "../../../../components/LoadingState";
import { ErrorState } from "../../../../components/ErrorState";
import { RecipeLineRow } from "../../../../components/recipe/RecipeLineRow";
import { AddIngredientSheet } from "../../../../components/recipe/AddIngredientSheet";
import { UnitPickerSheet } from "../../../../components/recipe/UnitPickerSheet";

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
  const [dishName, setDishName] = useState("");
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [unitTarget, setUnitTarget] = useState<RecipeComponentView | null>(null);
  // The ingredient just added: its amount box takes focus once it mounts, so
  // the merchant goes straight from "which" to "how much".
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !productId) return;
    try {
      const [loadedRecipe, options, unitCatalog, name] = await Promise.all([
        loadMenuItemRecipe(tenantId, productId),
        loadIngredientOptions(tenantId),
        loadUnitOptions(tenantId),
        loadDishName(tenantId, productId),
      ]);
      setRecipe(loadedRecipe);
      setIngredients(options);
      setUnits(unitCatalog);
      setDishName(name);
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

  const stockUnitByItem = useMemo(
    () => new Map(ingredients.map((option) => [option.id, option.stockUnitId])),
    [ingredients],
  );

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
    setIsPickerOpen(false);
    setFocusItemId(option.id);
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
  };

  const handleQuantityCommit = (line: RecipeComponentView, quantity: number) => {
    if (!tenantId) return;
    void runSave(() => updateRecipeComponent(tenantId, line.id, { quantity, unitId: line.unitId }));
  };

  const handleUnitPick = (unitId: string) => {
    const line = unitTarget;
    setUnitTarget(null);
    if (!tenantId || !line || unitId === line.unitId) return;
    void runSave(() =>
      updateRecipeComponent(tenantId, line.id, { quantity: line.quantity, unitId }),
    );
  };

  const handleRemove = (line: RecipeComponentView) => {
    if (!tenantId) return;
    const name = line.ingredientName || "this ingredient";
    Alert.alert("Remove ingredient", `Remove ${name} from the recipe?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => void runSave(() => removeRecipeComponent(tenantId, line.id)),
      },
    ]);
  };

  const header = (
    <BackHeader
      title="Recipe"
      subtitle={dishName || undefined}
      actions={
        isSaving ? (
          <View style={styles.saving} accessibilityLabel="Saving">
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={styles.savingText}>Saving</Text>
          </View>
        ) : undefined
      }
    />
  );

  if (!isAllowed) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.centered}>
          <Text style={styles.blockedText}>
            {"You don't have access to recipes. Ask the owner for the menu permission."}
          </Text>
        </View>
      </View>
    );
  }

  const body = (() => {
    if (!tenantId || isLoading) return <LoadingState />;
    if (error) return <ErrorState message={error} onRetry={() => void load()} />;
    return null;
  })();

  if (body) {
    return (
      <View style={styles.screen}>
        {header}
        {body}
      </View>
    );
  }

  const hasLines = components.length > 0;

  return (
    <View style={styles.screen}>
      {header}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {hasLines ? (
            <StatusBanner
              tone="success"
              icon="check"
              title="Deducting stock on every sale"
              message={`Each sale takes ${components.length} ${
                components.length === 1 ? "ingredient" : "ingredients"
              } off the shelf.`}
            />
          ) : (
            <StatusBanner
              tone="warning"
              icon="warning"
              title="No recipe yet"
              message="Sales of this product won't deduct stock until you add its ingredients here."
            />
          )}

          {hasLines ? (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.eyebrow}>Ingredients · {components.length}</Text>
                <Text style={styles.sectionHint}>Amount per sale</Text>
              </View>
              <View style={styles.list}>
                {components.map((line, index) => (
                  <View key={`${line.id}:${line.quantity}:${line.unitId}`}>
                    {index > 0 && <View style={styles.separator} />}
                    <RecipeLineRow
                      line={line}
                      disabled={isSaving}
                      autoFocus={line.inventoryItemId === focusItemId}
                      onFocus={() => setFocusItemId(null)}
                      onCommitQuantity={(quantity) => handleQuantityCommit(line, quantity)}
                      onOpenUnits={() => setUnitTarget(line)}
                      onRemove={() => handleRemove(line)}
                    />
                  </View>
                ))}
              </View>
              <Text style={styles.footnote}>
                Tap an amount to change it. New ingredients start at 1 of their stock unit.
              </Text>
            </>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Icon name="stock" size={22} color={colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>What goes into one sale?</Text>
              <Text style={styles.emptyText}>
                List each ingredient and how much one order uses — for example 18 g coffee beans
                and 200 ml milk for a latte.
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={hasLines ? "Add another ingredient" : "Add first ingredient"}
            icon="plus"
            size="lg"
            onPress={() => setIsPickerOpen(true)}
            disabled={isSaving}
          />
        </View>
      </KeyboardAvoidingView>

      <AddIngredientSheet
        visible={isPickerOpen}
        ingredients={ingredients}
        components={components}
        onPick={handleAdd}
        onClose={() => setIsPickerOpen(false)}
      />
      <UnitPickerSheet
        ingredientName={unitTarget ? unitTarget.ingredientName || "this ingredient" : null}
        units={units}
        selectedUnitId={unitTarget?.unitId ?? null}
        stockUnitId={unitTarget ? stockUnitByItem.get(unitTarget.inventoryItemId) ?? null : null}
        onPick={handleUnitPick}
        onClose={() => setUnitTarget(null)}
      />
    </View>
  );
}

const BANNER_TONES = {
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: colors.statusPending.text },
} as const;

interface StatusBannerProps {
  tone: keyof typeof BANNER_TONES;
  icon: IconName;
  title: string;
  message: string;
}

/** Whether this dish moves stock when it sells — the one fact the screen exists for. */
function StatusBanner({ tone, icon, title, message }: StatusBannerProps) {
  const palette = BANNER_TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      <View style={[styles.bannerIcon, { borderColor: palette.fg }]}>
        <Icon name={icon} size={16} color={palette.fg} strokeWidth={2.25} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.bannerTitle, { color: palette.fg }]}>{title}</Text>
        <Text style={styles.bannerText}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  blockedText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  saving: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  savingText: { ...typography.caption, color: colors.textSecondary },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  bannerIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { fontSize: 15, fontWeight: "700" },
  bannerText: { ...typography.caption, color: colors.textPrimary, marginTop: 2, lineHeight: 18 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  sectionHint: { ...typography.caption, color: colors.textSecondary },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, ...shadow.sm },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: spacing.lg },
  footnote: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  emptyCard: {
    alignItems: "center",
    marginTop: spacing.lg,
    padding: spacing.xxl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.separator,
    gap: spacing.xs,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...typography.heading, color: colors.textPrimary, textAlign: "center" },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center", maxWidth: 300 },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
});
