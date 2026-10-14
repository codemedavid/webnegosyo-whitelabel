/**
 * The recipe editor's behaviour, driven through its hook with the service
 * mocked (Jest cannot import `app/`). What is pinned is what the screen used
 * to get wrong through closures:
 *
 *  - two loads in flight (focus + a save's re-read) — only the NEWER one may
 *    land, or the editor shows a list from before the last save;
 *  - a load or save that finishes after the screen is gone sets no state;
 *  - "Add" tapped twice before the first save lands gives each line its own
 *    sort position, read when the save RUNS, not when it was tapped.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return { useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});

jest.mock("./recipe-service", () => ({
  loadRecipe: jest.fn(),
  loadIngredientOptions: jest.fn(),
  loadUnitOptions: jest.fn(),
  loadDishRecipeChoices: jest.fn(),
  loadDishRecipeCoverage: jest.fn(),
  ensureRecipe: jest.fn(),
  addRecipeComponent: jest.fn(),
  updateRecipeComponent: jest.fn(),
  removeRecipeComponent: jest.fn(),
}));
const service = jest.requireMock<Record<string, jest.Mock>>("./recipe-service");

import { useRecipeEditor } from "./use-recipe-editor";
import type { IngredientOption, MenuItemRecipe } from "./recipe-service";
import type { RecipeTarget } from "./recipe-target";

const DISH: RecipeTarget = { type: "menu_item", menuItemId: "dish-1" };
const MILK: IngredientOption = { id: "milk", name: "Milk", stockUnitId: "ml", unitLabel: "ml" };
const BEANS: IngredientOption = { id: "beans", name: "Beans", stockUnitId: "g", unitLabel: "g" };

function recipeWith(count: number, id = "r-1"): MenuItemRecipe {
  return {
    id,
    components: Array.from({ length: count }, (_, index) => ({
      id: `line-${index}`,
      inventoryItemId: `item-${index}`,
      ingredientName: `Item ${index}`,
      quantity: 1,
      unitId: "g",
      unitLabel: "g",
    })),
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  service.loadRecipe.mockResolvedValue(recipeWith(0));
  service.loadIngredientOptions.mockResolvedValue([MILK, BEANS]);
  service.loadUnitOptions.mockResolvedValue([{ id: "g", abbreviation: "g" }]);
  service.loadDishRecipeChoices.mockResolvedValue({ name: "Latte", groups: [] });
  service.loadDishRecipeCoverage.mockResolvedValue({});
  service.ensureRecipe.mockResolvedValue("r-1");
  service.addRecipeComponent.mockResolvedValue(undefined);
  service.updateRecipeComponent.mockResolvedValue(undefined);
  service.removeRecipeComponent.mockResolvedValue(undefined);
});

describe("loading", () => {
  it("shows the dish's recipe once read", async () => {
    service.loadRecipe.mockResolvedValue(recipeWith(2));
    const { result } = renderHook(() => useRecipeEditor(DISH, { tenantId: "t1" }));

    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    expect(result.current.state.components).toHaveLength(2);
    expect(result.current.state.dishName).toBe("Latte");
  });

  it("never lets an older load overwrite a newer one", async () => {
    // Arrange — the first read is slow; a second read starts and lands first.
    const slow = deferred<MenuItemRecipe>();
    service.loadRecipe.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(recipeWith(3));
    const { result } = renderHook(() => useRecipeEditor(DISH, { tenantId: "t1" }));

    // Act
    await act(async () => {
      await result.current.actions.reload();
    });
    expect(result.current.state.components).toHaveLength(3);
    await act(async () => {
      slow.resolve(recipeWith(1));
      await slow.promise;
    });

    // Assert — the stale answer was dropped.
    expect(result.current.state.components).toHaveLength(3);
  });

  it("sets no state once the screen has unmounted", async () => {
    const slow = deferred<MenuItemRecipe>();
    service.loadRecipe.mockReturnValueOnce(slow.promise);
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderHook(() => useRecipeEditor(DISH, { tenantId: "t1" }));

    unmount();
    await act(async () => {
      slow.resolve(recipeWith(2));
      await slow.promise;
    });

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("adding ingredients", () => {
  it("gives two quick adds their own sort positions, read when each save runs", async () => {
    // Arrange — the recipe already has two lines.
    service.loadRecipe.mockResolvedValue(recipeWith(2));
    const firstSave = deferred<void>();
    service.addRecipeComponent.mockReturnValueOnce(firstSave.promise).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useRecipeEditor(DISH, { tenantId: "t1" }));
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    // Act — both taps land before the first save does.
    act(() => {
      result.current.actions.add(MILK);
      result.current.actions.add(BEANS);
    });
    await act(async () => {
      firstSave.resolve();
      await firstSave.promise;
    });
    await waitFor(() => expect(result.current.state.isSaving).toBe(false));

    // Assert
    const orders = service.addRecipeComponent.mock.calls.map(([, input]) => input.sortOrder);
    expect(orders).toEqual([2, 3]);
    expect(service.addRecipeComponent.mock.calls.map(([, input]) => input.recipeId)).toEqual(["r-1", "r-1"]);
  });

  it("creates the recipe row once when the dish had none", async () => {
    service.loadRecipe.mockResolvedValue(null);
    const { result } = renderHook(() => useRecipeEditor(DISH, { tenantId: "t1" }));
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));

    await act(async () => {
      await result.current.actions.add(MILK);
    });

    expect(service.ensureRecipe).toHaveBeenCalledTimes(1);
    expect(service.addRecipeComponent).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ recipeId: "r-1", inventoryItemId: "milk", quantity: 1, unitId: "ml", sortOrder: 0 }),
    );
    expect(result.current.state.focusItemId).toBe("milk");
  });

  it("says why a save failed and re-reads what was stored", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    service.addRecipeComponent.mockRejectedValueOnce(new Error("Refused"));
    const { result } = renderHook(() => useRecipeEditor(DISH, { tenantId: "t1" }));
    await waitFor(() => expect(result.current.state.isLoading).toBe(false));
    const readsBefore = service.loadRecipe.mock.calls.length;

    await act(async () => {
      await result.current.actions.add(MILK);
    });

    expect(alert).toHaveBeenCalledWith("Recipe", "Refused");
    expect(service.loadRecipe.mock.calls.length).toBe(readsBefore + 1);
    expect(result.current.state.isSaving).toBe(false);
    alert.mockRestore();
  });
});
