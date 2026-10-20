/**
 * The recipe editor's behaviour: reading a dish's (or one choice's) recipe,
 * the queue every edit is saved through, and the sheets' open/closed state.
 * The screen (`app/(main)/product/recipe/[productId].tsx`) only lays it out.
 *
 * Three guards the screen's closures used to lack:
 *
 *  - A load answers only if it is still the NEWEST one. Focus and a save's
 *    re-read can overlap; the older answer arriving last showed a list from
 *    before the last save.
 *  - Nothing sets state once the screen is gone — a slow read or a queued save
 *    may finish after the merchant has backed out.
 *  - An added line's sort position and the recipe row it joins are read when
 *    its save RUNS (from refs kept current), not when "Add" was tapped. Two
 *    quick adds queued behind each other used to share one position.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "expo-router";
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
} from "./recipe-service";
import type { OptionRecipeChoice, OptionRecipeGroup, RecipeTarget } from "./recipe-target";
import { findChoice, summarizeChoiceCoverage, type ChoiceCoverageSummary } from "./recipe-editor";

const LOAD_ERROR = "Could not load the recipe.";
const SAVE_ERROR = "That did not save. Try again.";
const MISSING_UNIT_ERROR = "Set up a unit for this ingredient on the Inventory screen first.";

export interface RecipeEditorOptions {
  tenantId: string | null;
}

export interface RecipeEditorState {
  isChoice: boolean;
  recipe: MenuItemRecipe | null;
  components: RecipeComponentView[];
  dishName: string;
  choiceGroups: OptionRecipeGroup[];
  coverage: Record<string, number> | null;
  ingredients: IngredientOption[];
  units: UnitOption[];
  stockUnitByItem: ReadonlyMap<string, string | null>;
  /** The choice this editor was opened for; null on the dish's own recipe. */
  choice: OptionRecipeChoice | null;
  choiceSummary: ChoiceCoverageSummary;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  isPickerOpen: boolean;
  /** The line whose unit is being picked; null when the unit sheet is closed. */
  unitTarget: RecipeComponentView | null;
  /** The ingredient just added: its amount box takes focus once it mounts. */
  focusItemId: string | null;
}

export interface RecipeEditorActions {
  reload: () => Promise<void>;
  openPicker: () => void;
  closePicker: () => void;
  add: (ingredient: IngredientOption) => Promise<void>;
  commitQuantity: (line: RecipeComponentView, quantity: number) => Promise<void>;
  openUnits: (line: RecipeComponentView) => void;
  closeUnits: () => void;
  pickUnit: (unitId: string) => Promise<void>;
  /** Asks first; the line goes only once the merchant confirms. */
  remove: (line: RecipeComponentView) => void;
  clearFocus: () => void;
}

interface LoadedRecipe {
  recipe: MenuItemRecipe | null;
  ingredients: IngredientOption[];
  units: UnitOption[];
  dishName: string;
  choiceGroups: OptionRecipeGroup[];
  coverage: Record<string, number> | null;
}

/** Everything the editor shows, read together. Throws on a failed read. */
async function readRecipe(tenantId: string, target: RecipeTarget): Promise<LoadedRecipe> {
  const isChoice = target.type !== "menu_item";
  const [recipe, ingredients, units, dish, coverage] = await Promise.all([
    loadRecipe(tenantId, target),
    loadIngredientOptions(tenantId),
    loadUnitOptions(tenantId),
    loadDishRecipeChoices(tenantId, target.menuItemId),
    isChoice ? Promise.resolve(null) : loadDishRecipeCoverage(tenantId, target.menuItemId),
  ]);
  return { recipe, ingredients, units, dishName: dish.name, choiceGroups: dish.groups, coverage };
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useRecipeEditor(
  target: RecipeTarget,
  { tenantId }: RecipeEditorOptions,
): { state: RecipeEditorState; actions: RecipeEditorActions } {
  const isChoice = target.type !== "menu_item";
  const productId = target.menuItemId;

  const [loaded, setLoaded] = useState<LoadedRecipe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [unitTarget, setUnitTarget] = useState<RecipeComponentView | null>(null);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Only the newest load may land; see the module comment.
  const latestLoad = useRef(0);
  // Read by a save when it RUNS. A stored read only ever moves them forward,
  // so a gap in sort positions is possible, a repeat is not.
  const recipeIdRef = useRef<string | null>(null);
  const nextSortOrderRef = useRef(0);

  const load = useCallback(async () => {
    if (!tenantId || !productId) return;
    const token = latestLoad.current + 1;
    latestLoad.current = token;
    const isCurrent = () => isMounted.current && latestLoad.current === token;
    try {
      const next = await readRecipe(tenantId, target);
      if (!isCurrent()) return;
      recipeIdRef.current = next.recipe?.id ?? recipeIdRef.current;
      nextSortOrderRef.current = Math.max(nextSortOrderRef.current, next.recipe?.components.length ?? 0);
      setLoaded(next);
      setError(null);
    } catch (loadError: unknown) {
      if (isCurrent()) setError(messageOf(loadError, LOAD_ERROR));
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [tenantId, productId, target]);

  // On focus, not just on mount: coming back from a choice's recipe must show
  // its new ingredient count on the dish's list.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const components = useMemo(() => loaded?.recipe?.components ?? [], [loaded]);
  const ingredients = useMemo(() => loaded?.ingredients ?? [], [loaded]);
  const units = useMemo(() => loaded?.units ?? [], [loaded]);
  const choiceGroups = useMemo(() => loaded?.choiceGroups ?? [], [loaded]);
  const coverage = loaded?.coverage ?? null;

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
    (work: () => Promise<void>): Promise<void> => {
      pendingSaves.current += 1;
      setIsSaving(true);
      const next = saveQueue.current.then(async () => {
        try {
          await work();
        } catch (saveError: unknown) {
          Alert.alert("Recipe", messageOf(saveError, SAVE_ERROR));
        } finally {
          pendingSaves.current -= 1;
          if (pendingSaves.current === 0) {
            // One re-read after the last queued save shows what was stored.
            await load();
            if (isMounted.current) setIsSaving(false);
          }
        }
      });
      saveQueue.current = next;
      return next;
    },
    [load],
  );

  const add = useCallback(
    (ingredient: IngredientOption): Promise<void> => {
      if (!tenantId || !productId) return Promise.resolve();
      setIsPickerOpen(false);
      setFocusItemId(ingredient.id);
      return runSave(async () => {
        // The stock unit — always convertible to itself. An ingredient without
        // one cannot be judged, so the first unit is a starting point.
        const unitId = ingredient.stockUnitId ?? units[0]?.id;
        if (!unitId) throw new Error(MISSING_UNIT_ERROR);
        // `ensure` finds the row a save queued just before this one created.
        const recipeId = recipeIdRef.current ?? (await ensureRecipe(tenantId, target));
        recipeIdRef.current = recipeId;
        const sortOrder = nextSortOrderRef.current;
        nextSortOrderRef.current = sortOrder + 1;
        await addRecipeComponent(tenantId, {
          recipeId,
          inventoryItemId: ingredient.id,
          // 1 stock unit is a starting point the merchant is expected to edit,
          // not a guess at the real amount — but unlike zero it deducts.
          quantity: 1,
          unitId,
          sortOrder,
          check: lineCheck(ingredient.id, ingredient.name),
        });
      });
    },
    [tenantId, productId, target, units, lineCheck, runSave],
  );

  const saveLine = useCallback(
    (line: RecipeComponentView, quantity: number, unitId: string): Promise<void> => {
      if (!tenantId) return Promise.resolve();
      return runSave(() =>
        updateRecipeComponent(tenantId, line.id, {
          quantity,
          unitId,
          check: lineCheck(line.inventoryItemId, line.ingredientName),
        }),
      );
    },
    [tenantId, lineCheck, runSave],
  );

  const commitQuantity = useCallback(
    (line: RecipeComponentView, quantity: number) => saveLine(line, quantity, line.unitId),
    [saveLine],
  );

  const pickUnit = useCallback(
    (unitId: string): Promise<void> => {
      const line = unitTarget;
      setUnitTarget(null);
      if (!line || unitId === line.unitId) return Promise.resolve();
      return saveLine(line, line.quantity, unitId);
    },
    [unitTarget, saveLine],
  );

  const remove = useCallback(
    (line: RecipeComponentView) => {
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
    },
    [tenantId, runSave],
  );

  const state: RecipeEditorState = {
    isChoice,
    recipe: loaded?.recipe ?? null,
    components,
    dishName: loaded?.dishName ?? "",
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
  };

  const actions: RecipeEditorActions = {
    reload: load,
    openPicker: () => setIsPickerOpen(true),
    closePicker: () => setIsPickerOpen(false),
    add,
    commitQuantity,
    openUnits: setUnitTarget,
    closeUnits: () => setUnitTarget(null),
    pickUnit,
    remove,
    clearFocus: () => setFocusItemId(null),
  };

  return { state, actions };
}
