/**
 * Unified modifier groups for the merchant admin app — the single model behind
 * both product variations and add-ons.
 *
 * Pure and side-effect free so it can be unit-tested exhaustively. The functions
 * here NEVER touch the database. This is a mobile port of the web app's
 * `src/lib/modifier-groups.ts`; the read contract is identical so an item edited
 * here renders correctly on the customer web/menu.
 *
 * Backward compatibility is the core contract: a menu item may carry the new
 * `modifier_groups` payload OR only the legacy `variation_types` / `variations`
 * / `addons` columns. `normalizeModifierGroups` returns the same
 * `ModifierGroup[]` shape either way, so the editor always works on one model.
 */

/** How an option's remaining stock is tracked. */
export type ModifierStockMode = "none" | "simple" | "recipe";

export interface ModifierOption {
  id: string;
  name: string;
  price_modifier: number; // added to base price (+0, +2, +5)
  image_url?: string;
  is_default?: boolean;
  display_order: number;
  manual_cost?: number;
  stock_mode?: ModifierStockMode;
  stock_qty?: number;
  is_available?: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  display_order: number;
  // Selection rules. min_select === 0 → optional; max_select === 1 → single-select
  // (variation-style); max_select === null → unlimited (add-on style).
  min_select: number;
  max_select: number | null;
  options: ModifierOption[];
}

/** Legacy shapes an item may still carry instead of `modifier_groups`. */
export interface LegacyVariation {
  id: string;
  name: string;
  price_modifier: number;
  is_default?: boolean;
}

export interface LegacyVariationType {
  id: string;
  name: string;
  is_required: boolean;
  display_order: number;
  options: {
    id: string;
    name: string;
    price_modifier: number;
    image_url?: string | null;
    is_default?: boolean;
    display_order: number;
  }[];
}

export interface LegacyAddon {
  id: string;
  name: string;
  price: number;
  is_default?: boolean;
}

/** Subset of a menu item row that carries modifier data (all optional/legacy). */
export interface ModifierSource {
  modifier_groups?: ModifierGroup[] | null;
  variation_types?: LegacyVariationType[] | null;
  variations?: LegacyVariation[] | null;
  addons?: LegacyAddon[] | null;
}

export const LEGACY_VARIATION_GROUP_NAME = "Options";
export const LEGACY_ADDON_GROUP_NAME = "Add-ons";

/**
 * Return the item's modifier groups as one normalized model.
 *
 * Precedence: explicit `modifier_groups` → grouped `variation_types` + `addons`
 * → legacy flat `variations` + `addons`. Groups and options are returned sorted
 * by `display_order`.
 */
export function normalizeModifierGroups(item: ModifierSource): ModifierGroup[] {
  if (item.modifier_groups && item.modifier_groups.length > 0) {
    return sortGroups(item.modifier_groups);
  }

  const groups: ModifierGroup[] = [];

  if (item.variation_types && item.variation_types.length > 0) {
    groups.push(...item.variation_types.map(groupFromVariationType));
  } else if (item.variations && item.variations.length > 0) {
    groups.push(groupFromLegacyVariations(item.variations));
  }

  if (item.addons && item.addons.length > 0) {
    groups.push(groupFromAddons(item.addons));
  }

  return sortGroups(groups);
}

function sortGroups(groups: readonly ModifierGroup[]): ModifierGroup[] {
  return [...groups]
    .sort((a, b) => a.display_order - b.display_order)
    .map((g) => ({
      ...g,
      options: [...g.options].sort((a, b) => a.display_order - b.display_order),
    }));
}

function groupFromVariationType(type: LegacyVariationType): ModifierGroup {
  return {
    id: type.id,
    name: type.name,
    display_order: type.display_order,
    min_select: type.is_required ? 1 : 0,
    max_select: 1,
    options: type.options.map((o) => ({
      id: o.id,
      name: o.name,
      price_modifier: o.price_modifier,
      image_url: o.image_url ?? undefined,
      is_default: o.is_default,
      display_order: o.display_order,
    })),
  };
}

function groupFromLegacyVariations(variations: readonly LegacyVariation[]): ModifierGroup {
  return {
    id: "legacy-variations",
    name: LEGACY_VARIATION_GROUP_NAME,
    display_order: 0,
    min_select: 0,
    max_select: 1,
    options: variations.map((v, index) => ({
      id: v.id,
      name: v.name,
      price_modifier: v.price_modifier,
      is_default: v.is_default,
      display_order: index,
    })),
  };
}

function groupFromAddons(addons: readonly LegacyAddon[]): ModifierGroup {
  return {
    id: "legacy-addons",
    name: LEGACY_ADDON_GROUP_NAME,
    display_order: 1000,
    min_select: 0,
    max_select: null,
    options: addons.map((a, index) => ({
      id: a.id,
      name: a.name,
      price_modifier: a.price,
      is_default: a.is_default,
      display_order: index,
    })),
  };
}

export interface ModifierValidationResult {
  valid: boolean;
  errors: Record<string, string>; // keyed by group id
}

/**
 * Validate merchant-authored groups before they are saved. Groups are optional
 * on a product, but any present group must be well-formed:
 * a non-blank name, at least one named option, and coherent min/max rules.
 */
export function validateModifierGroups(
  groups: readonly ModifierGroup[]
): ModifierValidationResult {
  const errors: Record<string, string> = {};

  for (const group of groups) {
    const error = validateGroup(group);
    if (error) errors[group.id] = error;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function validateGroup(group: ModifierGroup): string | null {
  if (!group.name || group.name.trim().length === 0) {
    return "Group name is required";
  }
  if (group.options.length === 0) {
    return "Add at least one option";
  }
  if (group.options.some((o) => !o.name || o.name.trim().length === 0)) {
    return "Every option needs a name";
  }
  if (group.min_select < 0 || group.min_select > group.options.length) {
    return "Minimum selections is out of range";
  }
  if (group.max_select !== null) {
    if (group.max_select < 1) {
      return "Maximum selections must be at least 1";
    }
    if (group.max_select < group.min_select) {
      return "Maximum cannot be less than minimum";
    }
  }
  return null;
}

/**
 * Assign sequential `display_order` to groups and their options so the saved
 * payload preserves the merchant's on-screen order. Pure — never mutates input.
 */
export function serializeModifierGroups(
  groups: readonly ModifierGroup[]
): ModifierGroup[] {
  return groups.map((group, groupIndex) => ({
    ...group,
    display_order: groupIndex,
    options: group.options.map((option, optionIndex) => ({
      ...option,
      display_order: optionIndex,
    })),
  }));
}

/** The legacy shape of the columns the storefront, customer app and POS read. */
export interface LegacyColumns {
  variation_types: LegacyVariationType[];
  variations: LegacyVariation[];
  addons: LegacyAddon[];
}

/** A group is single-select (variation-style) when its cap is exactly 1. */
export function isSingleSelectGroup(group: ModifierGroup): boolean {
  return group.max_select === 1;
}

/**
 * Mirror unified groups back into the legacy columns.
 *
 * This is the backward-compatibility contract: surfaces that do not yet read
 * `modifier_groups` (the customer storefront, the white-labeled customer app,
 * the desktop POS) render from `variation_types` / `addons`. Writing only
 * `modifier_groups` would make anything authored here invisible to customers.
 *
 * Single-select groups become `variation_types`; every multi-select group's
 * options are flattened into the shared `addons` list. `variations` — the oldest
 * flat format — is always emitted empty because grouped `variation_types` fully
 * supersedes it. An empty input yields empty columns, so removing every group in
 * the editor also clears the legacy data instead of leaving it stale.
 *
 * Mirrors the web admin's `src/lib/modifier-groups-form.ts` so both editors
 * produce byte-identical rows for the same groups. Pure — never mutates input.
 */
export function splitGroupsToLegacyColumns(
  groups: readonly ModifierGroup[]
): LegacyColumns {
  const variation_types: LegacyVariationType[] = [];
  const addons: LegacyAddon[] = [];

  groups.forEach((group, groupIndex) => {
    if (isSingleSelectGroup(group)) {
      variation_types.push({
        id: group.id,
        name: group.name,
        is_required: group.min_select >= 1,
        display_order: group.display_order ?? groupIndex,
        options: group.options.map((option, optionIndex) => ({
          id: option.id,
          name: option.name,
          price_modifier: option.price_modifier,
          image_url: option.image_url,
          is_default: option.is_default,
          display_order: option.display_order ?? optionIndex,
        })),
      });
      return;
    }

    group.options.forEach((option) => {
      addons.push({
        id: option.id,
        name: option.name,
        price: option.price_modifier,
        is_default: option.is_default,
      });
    });
  });

  return { variation_types, variations: [], addons };
}
