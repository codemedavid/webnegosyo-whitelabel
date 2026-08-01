/**
 * Immutable editing operations for a product's modifier groups.
 *
 * Every function returns a new array/object and never mutates its input, so the
 * screen can drive React state safely (`setGroups(addOption(groups, id))`). Pure
 * and DB-free — persistence lives in `lib/products.ts`.
 */

import type { ModifierGroup, ModifierOption } from "./modifier-groups";

let idCounter = 0;

/** Generate a locally-unique id for a new group or option. */
export function newId(prefix = "m"): string {
  idCounter += 1;
  return `${prefix}_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyOption(): ModifierOption {
  return { id: newId("opt"), name: "", price_modifier: 0, display_order: 0 };
}

/** A fresh optional single-select group seeded with one blank option. */
export function createEmptyGroup(): ModifierGroup {
  return {
    id: newId("grp"),
    name: "",
    display_order: 0,
    min_select: 0,
    max_select: 1,
    options: [createEmptyOption()],
  };
}

export function addGroup(groups: readonly ModifierGroup[]): ModifierGroup[] {
  return [...groups, createEmptyGroup()];
}

/** Name a new add-on group starts with, so merchants recognise it at a glance. */
export const DEFAULT_ADDON_GROUP_NAME = "Add-ons";

/**
 * A fresh add-on group: optional and unlimited multi-select, pre-named and
 * seeded with one blank option.
 *
 * Add-ons and variations share one model — an add-on is just a multi-select
 * group. Merchants do not think in those terms, so this factory pre-applies the
 * rules and gives the "Add add-on" button something to create in one tap.
 */
export function createAddonGroup(): ModifierGroup {
  return {
    ...createEmptyGroup(),
    name: DEFAULT_ADDON_GROUP_NAME,
    min_select: 0,
    max_select: null,
  };
}

export function addAddonGroup(groups: readonly ModifierGroup[]): ModifierGroup[] {
  return [...groups, createAddonGroup()];
}

export function removeGroup(
  groups: readonly ModifierGroup[],
  groupId: string
): ModifierGroup[] {
  return groups.filter((g) => g.id !== groupId);
}

export function updateGroup(
  groups: readonly ModifierGroup[],
  groupId: string,
  patch: Partial<ModifierGroup>
): ModifierGroup[] {
  return groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g));
}

function mapOptions(
  groups: readonly ModifierGroup[],
  groupId: string,
  transform: (options: readonly ModifierOption[]) => ModifierOption[]
): ModifierGroup[] {
  return groups.map((g) =>
    g.id === groupId ? { ...g, options: transform(g.options) } : g
  );
}

export function addOption(
  groups: readonly ModifierGroup[],
  groupId: string
): ModifierGroup[] {
  return mapOptions(groups, groupId, (options) => [...options, createEmptyOption()]);
}

export function removeOption(
  groups: readonly ModifierGroup[],
  groupId: string,
  optionId: string
): ModifierGroup[] {
  return mapOptions(groups, groupId, (options) =>
    options.filter((o) => o.id !== optionId)
  );
}

export function updateOption(
  groups: readonly ModifierGroup[],
  groupId: string,
  optionId: string,
  patch: Partial<ModifierOption>
): ModifierGroup[] {
  return mapOptions(groups, groupId, (options) =>
    options.map((o) => (o.id === optionId ? { ...o, ...patch } : o))
  );
}

export function moveOption(
  groups: readonly ModifierGroup[],
  groupId: string,
  fromIndex: number,
  toIndex: number
): ModifierGroup[] {
  return mapOptions(groups, groupId, (options) => {
    if (
      fromIndex < 0 ||
      fromIndex >= options.length ||
      toIndex < 0 ||
      toIndex >= options.length
    ) {
      return [...options];
    }
    const next = [...options];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  });
}

/** Whether a group is single-select (variation-style) or multi-select (add-ons). */
export function groupSelectionMode(group: ModifierGroup): "single" | "multi" {
  return group.max_select === 1 ? "single" : "multi";
}

/**
 * Toggle whether a choice from this group is mandatory. Required forces at least
 * one selection; optional allows zero.
 */
export function setGroupRequired(
  groups: readonly ModifierGroup[],
  groupId: string,
  required: boolean
): ModifierGroup[] {
  return updateGroup(groups, groupId, { min_select: required ? 1 : 0 });
}

/**
 * Switch a group between single-select (max 1) and unlimited multi-select
 * (max null, add-on style).
 */
export function setGroupMultiple(
  groups: readonly ModifierGroup[],
  groupId: string,
  multiple: boolean
): ModifierGroup[] {
  return updateGroup(groups, groupId, { max_select: multiple ? null : 1 });
}
