import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuthStore } from "../../../../stores/auth-store";
import { hasPermission } from "../../../../lib/staff-permissions";
import {
  isOptionTargetType,
  optionTarget,
  type OptionRecipeChoice,
  type RecipeTarget,
} from "../../../../lib/recipe-target";
import { useRecipeEditor } from "../../../../lib/use-recipe-editor";
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
 * lives in lib/recipe-service.ts and the editor's behaviour (loading, the save
 * queue, the sheets) in lib/use-recipe-editor.ts; this screen only lays it out.
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
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);

  // Rewiring what a sale deducts is a menu decision, so it rides the same
  // "menu" key that gates the inventory and product-management tabs. The tab
  // bar already hides those from an ungranted staffer, but this is a detail
  // route reachable by URL, so it refuses on its own as well.
  const isAllowed = hasPermission({ role, isOwner, permissions }, "menu");

  const { state, actions } = useRecipeEditor(target, { tenantId });
  const {
    isChoice,
    components,
    dishName,
    choiceGroups,
    coverage,
    ingredients,
    units,
    stockUnitByItem,
    choice,
    choiceSummary,
    isLoading,
    error,
    isSaving,
    isPickerOpen,
    unitTarget,
    focusItemId,
  } = state;

  const openChoice = (picked: OptionRecipeChoice) => {
    if (!productId || picked.target.type === "menu_item") return;
    router.push(recipeHref(productId, { kind: picked.target.type, optionId: picked.optionId }));
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
    if (error) return <ErrorState message={error} onRetry={() => void actions.reload()} />;
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
                      onFocus={actions.clearFocus}
                      onCommitQuantity={(quantity) => void actions.commitQuantity(line, quantity)}
                      onOpenUnits={() => actions.openUnits(line)}
                      onRemove={() => actions.remove(line)}
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
            onPress={actions.openPicker}
            disabled={isSaving}
          />
        </View>
      </KeyboardAvoidingView>

      <AddIngredientSheet
        visible={isPickerOpen}
        ingredients={ingredients}
        components={components}
        onPick={(ingredient) => void actions.add(ingredient)}
        onClose={actions.closePicker}
      />
      <UnitPickerSheet
        ingredientName={unitTarget ? unitTarget.ingredientName || "this ingredient" : null}
        units={units}
        selectedUnitId={unitTarget?.unitId ?? null}
        stockUnitId={unitTarget ? stockUnitByItem.get(unitTarget.inventoryItemId) ?? null : null}
        onPick={(unitId) => void actions.pickUnit(unitId)}
        onClose={actions.closeUnits}
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
