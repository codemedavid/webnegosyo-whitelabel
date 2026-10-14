/**
 * Which `recipes` row a dish or one of its choices is costed by, and how each
 * kind of choice on a dish maps to one.
 *
 * Mirrors the web app's `src/lib/inventory/recipe-target.ts` (the app cannot
 * import root `src/`). The column mapping must match it exactly: the partial
 * unique indexes on `recipes` key each target type on its own id column, and
 * depletion (`src/lib/inventory/order-depletion.ts`) looks recipes up the same
 * way.
 *
 *   menu_item        → menu_item_id                         (the dish itself)
 *   modifier_option  → menu_item_id + modifier_option_id    (`modifier_groups`)
 *   variation_option → menu_item_id + variation_option_id   (legacy variations)
 *   addon            → menu_item_id + addon_id              (legacy add-ons)
 *
 * A choice's recipe is spent ON TOP of the dish's own recipe, once per portion
 * picked. Pure.
 */

import type { ModifierSource } from "./modifier-groups";
import { LEGACY_ADDON_GROUP_NAME, LEGACY_VARIATION_GROUP_NAME } from "./modifier-groups";

export type RecipeTarget =
  | { type: "menu_item"; menuItemId: string }
  | { type: "modifier_option"; menuItemId: string; modifierOptionId: string }
  | { type: "variation_option"; menuItemId: string; variationOptionId: string }
  | { type: "addon"; menuItemId: string; addonId: string };

export type RecipeTargetType = RecipeTarget["type"];

/** The choice kinds — every target but the dish itself. */
export type OptionTargetType = Exclude<RecipeTargetType, "menu_item">;

export const OPTION_TARGET_TYPES: readonly OptionTargetType[] = [
  "modifier_option",
  "variation_option",
  "addon",
];

export interface RecipeTargetColumns {
  target_type: RecipeTargetType;
  menu_item_id: string;
  variation_option_id: string | null;
  addon_id: string | null;
  modifier_option_id: string | null;
}

/** The `recipes` id column each choice kind is keyed on. */
export const OPTION_ID_COLUMN: Record<
  OptionTargetType,
  "modifier_option_id" | "variation_option_id" | "addon_id"
> = {
  modifier_option: "modifier_option_id",
  variation_option: "variation_option_id",
  addon: "addon_id",
};

function requireId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

/** The exact `recipes` columns for a target; never leaks another kind's id. */
export function buildRecipeTargetColumns(target: RecipeTarget): RecipeTargetColumns {
  const base = {
    menu_item_id: requireId(target.menuItemId, "Menu item"),
    variation_option_id: null,
    addon_id: null,
    modifier_option_id: null,
  };
  switch (target.type) {
    case "menu_item":
      return { ...base, target_type: "menu_item" };
    case "modifier_option":
      return {
        ...base,
        target_type: "modifier_option",
        modifier_option_id: requireId(target.modifierOptionId, "Modifier option"),
      };
    case "variation_option":
      return {
        ...base,
        target_type: "variation_option",
        variation_option_id: requireId(target.variationOptionId, "Variation option"),
      };
    case "addon":
      return { ...base, target_type: "addon", addon_id: requireId(target.addonId, "Addon") };
  }
}

/** The choice's own id, or null for the dish itself. */
export function targetOptionId(target: RecipeTarget): string | null {
  switch (target.type) {
    case "menu_item":
      return null;
    case "modifier_option":
      return target.modifierOptionId;
    case "variation_option":
      return target.variationOptionId;
    case "addon":
      return target.addonId;
  }
}

/** A stable key for a target within one dish: `menu_item` or `addon:a1`. */
export function targetKey(target: RecipeTarget): string {
  const optionId = targetOptionId(target);
  return optionId === null ? target.type : `${target.type}:${optionId}`;
}

/** Build a choice's target from its kind and id. */
export function optionTarget(
  menuItemId: string,
  type: OptionTargetType,
  optionId: string,
): RecipeTarget {
  switch (type) {
    case "modifier_option":
      return { type, menuItemId, modifierOptionId: optionId };
    case "variation_option":
      return { type, menuItemId, variationOptionId: optionId };
    case "addon":
      return { type, menuItemId, addonId: optionId };
  }
}

export function isOptionTargetType(value: unknown): value is OptionTargetType {
  return (OPTION_TARGET_TYPES as readonly unknown[]).includes(value);
}

export interface OptionRecipeChoice {
  optionId: string;
  name: string;
  target: RecipeTarget;
}

export interface OptionRecipeGroup {
  id: string;
  name: string;
  choices: OptionRecipeChoice[];
}

function hasId(value: { id?: unknown }): value is { id: string } {
  return typeof value.id === "string" && value.id.trim().length > 0;
}

/**
 * Every choice on a dish a recipe can attach to, grouped as the menu shows
 * them, each with the target its sales deplete through.
 *
 * Same precedence as `normalizeModifierGroups` (and the register): a dish with
 * `modifier_groups` sells THOSE option ids, so its choices are modifier
 * options — legacy columns beside them are mirrors and are not offered twice.
 * Otherwise grouped variation types (or the flat legacy variations) are
 * variation options, and legacy add-ons are add-ons.
 */
export function dishRecipeChoices(menuItemId: string, source: ModifierSource): OptionRecipeGroup[] {
  const choice = (type: OptionTargetType) => (option: { id: string; name: string }): OptionRecipeChoice => ({
    optionId: option.id,
    name: option.name,
    target: optionTarget(menuItemId, type, option.id),
  });

  if (source.modifier_groups && source.modifier_groups.length > 0) {
    return [...source.modifier_groups]
      .sort((a, b) => a.display_order - b.display_order)
      .map((group) => ({
        id: group.id,
        name: group.name,
        choices: [...group.options]
          .filter(hasId)
          .sort((a, b) => a.display_order - b.display_order)
          .map(choice("modifier_option")),
      }))
      .filter((group) => group.choices.length > 0);
  }

  const groups: OptionRecipeGroup[] = [];
  if (source.variation_types && source.variation_types.length > 0) {
    groups.push(
      ...[...source.variation_types]
        .sort((a, b) => a.display_order - b.display_order)
        .map((type) => ({
          id: type.id,
          name: type.name,
          choices: [...type.options]
            .filter(hasId)
            .sort((a, b) => a.display_order - b.display_order)
            .map(choice("variation_option")),
        })),
    );
  } else if (source.variations && source.variations.length > 0) {
    groups.push({
      id: "legacy-variations",
      name: LEGACY_VARIATION_GROUP_NAME,
      choices: source.variations.filter(hasId).map(choice("variation_option")),
    });
  }
  if (source.addons && source.addons.length > 0) {
    groups.push({
      id: "legacy-addons",
      name: LEGACY_ADDON_GROUP_NAME,
      choices: source.addons.filter(hasId).map(choice("addon")),
    });
  }
  return groups.filter((group) => group.choices.length > 0);
}
