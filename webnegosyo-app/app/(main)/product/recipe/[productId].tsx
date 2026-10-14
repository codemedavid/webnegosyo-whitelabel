import React, { useCallback, useMemo, useRef, useState } from "react";
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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuthStore } from "../../../../stores/auth-store";
import { hasPermission } from "../../../../lib/staff-permissions";
import {
  addRecipeComponent,
  ensureRecipe,
  loadDishRecipeChoices,
  loadDishRecipeCoverage,
  loadIngredientOptions,
  loadRecipe,
  loadUnitOptions,
  removeRecipeComponent,
  updateRecipeComponent,
  type IngredientOption,
  type LineCheck,
  type MenuItemRecipe,
  type RecipeComponentView,
  type UnitOption,
} from "../../../../lib/recipe-service";
import {
  isOptionTargetType,
  optionTarget,
  type OptionRecipeChoice,
  type OptionRecipeGroup,
  type RecipeTarget,
} from "../../../../lib/recipe-target";
import { findChoice, summarizeChoiceCoverage } from "../../../../lib/recipe-editor";
import { recipeHref } from "../../../../lib/navigation";
import { colors, typography, spacing, radius, shadow } from "../../../../theme/colors";
import { BackHeader } from "../../../../components/BackHeader";
import { Button } from "../../../../components/Button";
import { Icon } from "../../../../components/Icon";
import { LoadingState } from "../../../../components/LoadingState";
import { ErrorState } from "../../../../components/ErrorState";
import { RecipeLineRow } from "../../../../components/recipe/RecipeLineRow";
import { AddIngredientSheet } from "../../../../components/recipe/AddIngredientSheet";
import { UnitPickerSheet } from "../../../../components/recipe/UnitPickerSheet";
import { RecipeStatusBanner } from "../../../../components/recipe/RecipeStatusBanner";
import { DishChoicesSection } from "../../../../components/recipe/DishChoicesSection";

/** What a choice's recipe means, said wherever one is edited. */
const CHOICE_RECIPE_COPY =
  "These ingredients are used each time this choice is picked, on top of the dish's own recipe.";

/** The editor's target from its route: the dish, or one choice on it. */
function targetFromParams(productId: string, kind?: string, option?: string): RecipeTarget {
  if (option && isOptionTargetType(kind)) return optionTarget(productId, kind, option);
  return { type: "menu_item", menuItemId: productId };
}

/**
 * The recipe (ingredients) editor for one dish.
 *
 * This is the write path that makes deduction real for an app-first merchant:
 * a sale only moves stock when the dish has a recipe, and until this screen
 * the app could show the shelf but never wire a dish to it. All data access
 * lives in lib/recipe-service.ts; this screen only arranges it.
 *
 * Opened for the dish, it edits the dish's own recipe and lists every choice
 * on it (flavours, sizes, add-ons); opened with `?kind=&option=` it edits one
 * choice's recipe — spent each time that choice is picked, on top of the
 * dish's own (see `recipeHref`).
 */
export default function RecipeEditorScreen() {
  const { productId, kind, option } = useLocalSearchParams<{
    productId: string;
    kind?: string;
    option?: string;
  }>();
  const target = useMemo(
    () => targetFromParams(productId ?? "", kind, option),
    [productId, kind, option],
  );
  const isChoice = target.type !== "menu_item";
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
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
  const [choiceGroups, setChoiceGroups] = useState<OptionRecipeGroup[]>([]);
  const [coverage, setCoverage] = useState<Record<string, number> | null>(null);
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
      const [loadedRecipe, options, unitCatalog, dish, dishCoverage] = await Promise.all([
        loadRecipe(tenantId, target),
        loadIngredientOptions(tenantId),
        loadUnitOptions(tenantId),
        loadDishRecipeChoices(tenantId, productId),
        isChoice ? Promise.resolve(null) : loadDishRecipeCoverage(tenantId, productId),
      ]);
      setRecipe(loadedRecipe);
      setIngredients(options);
      setUnits(unitCatalog);
      setDishName(dish.name);
      setChoiceGroups(dish.groups);
      setCoverage(dishCoverage);
      setError(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the recipe.");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, productId, target, isChoice]);

  // On focus, not just on mount: coming back from a choice's recipe must show
  // its new ingredient count on the dish's list.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const components = useMemo(() => recipe?.components ?? [], [recipe]);

  const stockUnitByItem = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.stockUnitId])),
    [ingredients],
  );

  const choice = useMemo(
    () => (isChoice ? findChoice(choiceGroups, target) : null),
    [isChoice, choiceGroups, target],
  );
  const choiceSummary = useMemo(
    () => summarizeChoiceCoverage(choiceGroups, coverage),
    [choiceGroups, coverage],
  );

  /** What a line is judged against: its ingredient's stock unit and the catalogue. */
  const lineCheck = useCallback(
    (inventoryItemId: string, ingredientName: string): LineCheck => ({
      ingredient: { name: ingredientName, stockUnitId: stockUnitByItem.get(inventoryItemId) ?? null },
      units,
    }),
    [stockUnitByItem, units],
  );

  // Saves run one after another rather than being dropped while one is in
  // flight: an amount committed on blur and an "Add" tapped straight after
  // both have to land, and a dropped one used to vanish without a word.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);
  const runSave = useCallback(
    (work: () => Promise<void>) => {
      pendingSaves.current += 1;
      setIsSaving(true);
      const next = saveQueue.current.then(async () => {
        try {
          await work();
        } catch (saveError: unknown) {
          Alert.alert(
            "Recipe",
            saveError instanceof Error ? saveError.message : "That did not save. Try again.",
          );
        } finally {
          pendingSaves.current -= 1;
          if (pendingSaves.current === 0) {
            // One re-read after the last queued save shows what was stored.
            await load();
            setIsSaving(false);
          }
        }
      });
      saveQueue.current = next;
      return next;
    },
    [load],
  );

  const handleAdd = (ingredient: IngredientOption) => {
    if (!tenantId || !productId) return;
    setIsPickerOpen(false);
    setFocusItemId(ingredient.id);
    void runSave(async () => {
      // The stock unit — always convertible to itself. An ingredient without
      // one cannot be judged, so the first unit is a starting point.
      const unitId = ingredient.stockUnitId ?? units[0]?.id;
      if (!unitId) {
        throw new Error("Set up a unit for this ingredient on the Inventory screen first.");
      }
      // `ensure` finds the row a save queued just before this one created.
      const recipeId = recipe?.id ?? (await ensureRecipe(tenantId, target));
      await addRecipeComponent(tenantId, {
        recipeId,
        inventoryItemId: ingredient.id,
        // 1 stock unit is a starting point the merchant is expected to edit,
        // not a guess at the real amount — but unlike zero it deducts.
        quantity: 1,
        unitId,
        sortOrder: components.length,
        check: lineCheck(ingredient.id, ingredient.name),
      });
    });
  };

  const handleQuantityCommit = (line: RecipeComponentView, quantity: number) => {
    if (!tenantId) return;
    void runSave(() =>
      updateRecipeComponent(tenantId, line.id, {
        quantity,
        unitId: line.unitId,
        check: lineCheck(line.inventoryItemId, line.ingredientName),
      }),
    );
  };

  const handleUnitPick = (unitId: string) => {
    const line = unitTarget;
    setUnitTarget(null);
    if (!tenantId || !line || unitId === line.unitId) return;
    void runSave(() =>
      updateRecipeComponent(tenantId, line.id, {
        quantity: line.quantity,
        unitId,
        check: lineCheck(line.inventoryItemId, line.ingredientName),
      }),
    );
  };

  const openChoice = (picked: OptionRecipeChoice) => {
    if (!productId || picked.target.type === "menu_item") return;
    router.push(recipeHref(productId, { kind: picked.target.type, optionId: picked.optionId }));
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
      title={isChoice ? choice?.name || "Choice recipe" : "Recipe"}
      subtitle={(isChoice ? (dishName ? `Choice on ${dishName}` : "Choice") : dishName) || undefined}
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
          {isChoice ? (
            <RecipeStatusBanner
              tone={hasLines ? "success" : "info"}
              icon={hasLines ? "check" : "info"}
              title={hasLines ? "Deducting stock every time it's picked" : "No ingredients for this choice yet"}
              message={CHOICE_RECIPE_COPY}
            />
          ) : hasLines ? (
            <RecipeStatusBanner
              tone="success"
              icon="check"
              title="Deducting stock on every sale"
              message={`Each sale takes ${components.length} ${
                components.length === 1 ? "ingredient" : "ingredients"
              } off the shelf.`}
            />
          ) : (
            <RecipeStatusBanner
              tone="warning"
              icon="warning"
              title="No recipe yet"
              message="Sales of this product won't deduct stock until you add its ingredients here."
            />
          )}

          {!isChoice && choiceSummary.isUncovered && (
            <View style={styles.hint}>
              <RecipeStatusBanner
                tone="warning"
                icon="warning"
                title="Its choices deduct nothing yet"
                message={`This dish has ${choiceSummary.total} ${
                  choiceSummary.total === 1 ? "choice" : "choices"
                } and none uses any ingredients, so every flavour, size or add-on picked sells without taking stock. Open a choice below to add what it uses.`}
              />
            </View>
          )}

          {hasLines ? (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.eyebrow}>Ingredients · {components.length}</Text>
                <Text style={styles.sectionHint}>{isChoice ? "Amount per pick" : "Amount per sale"}</Text>
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
              <Text style={styles.emptyTitle}>
                {isChoice ? "What does picking it use?" : "What goes into one sale?"}
              </Text>
              <Text style={styles.emptyText}>
                {isChoice
                  ? "List what one pick of this choice adds — for example 30 g beef bulgogi for a flavour, or 1 egg for an add-on."
                  : "List each ingredient and how much one order uses — for example 18 g coffee beans and 200 ml milk for a latte."}
              </Text>
            </View>
          )}

          {!isChoice && (
            <DishChoicesSection groups={choiceGroups} coverage={coverage} onOpen={openChoice} />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  blockedText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  saving: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  savingText: { ...typography.caption, color: colors.textSecondary },
  hint: { marginTop: spacing.md },
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
