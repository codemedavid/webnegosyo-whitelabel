/**
 * Managing the store's menu categories from the merchant app.
 *
 * A category row carries more than this app edits. `order`, `display_layout`,
 * `card_template` and `default_addons` are set on the web — the Branding
 * Studio's "Menu Layout" surface — and have no editor on a phone. So an edit
 * here writes ONLY the five fields the app's form owns, and every other column
 * is left untouched. The web learned this the expensive way (`updateCategory`
 * parses a full schema whose defaults reset those columns, which is why
 * `updateCategoryFields` exists beside it); writing a whole row back from here
 * would mean renaming a category on a phone quietly flattened the merchant's
 * storefront layout.
 *
 * The one exception is `order`, which this screen does own — arranging the menu
 * is half of what a merchant opens it for — and which is written on its own,
 * through `reorderCategories`, never as part of a field edit.
 */

import { supabase } from "./supabase";
import { isKnownCategoryIcon, isValidCategoryIconColor } from "./category-icon-catalog";

/** A category as the management screens see it. */
export interface ManagedCategory {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  /** `lucide:<name>` from the curated catalog, a raw emoji, or null. */
  icon: string | null;
  /** 6-digit hex tint for the icon; null falls back to the tenant's brand colour. */
  icon_color: string | null;
  /** What the storefront sorts categories by. */
  order: number;
  is_active: boolean;
}

/** The editable fields, as the form holds them. */
export interface CategoryInput {
  name: string;
  description: string;
  icon: string;
  icon_color: string;
  is_active: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export type MoveDirection = "up" | "down";

/** Pristine form values for adding a new category. */
export const EMPTY_CATEGORY_INPUT: CategoryInput = {
  name: "",
  description: "",
  icon: "",
  icon_color: "",
  is_active: true,
};

/** Matches the web's `categorySchema`, which is what the same row is saved through there. */
const MIN_NAME_LENGTH = 2;

/** All editor state derived from a loaded category, or a clean slate when null. */
export interface EditorFormState {
  form: CategoryInput;
}

/**
 * Resolve the category editor's initial state from a loaded row, or a clean
 * slate when `loaded` is null.
 *
 * The editor is pushed onto a tab stack that is never unmounted, so one screen
 * instance serves "edit this one" and then "add a new one" — passing `null`
 * returns a fresh {@link EMPTY_CATEGORY_INPUT} copy so the previous category's
 * icon cannot ride along into the new one.
 */
export function buildCategoryEditorState(
  loaded: ManagedCategory | null,
): EditorFormState {
  if (!loaded) return { form: { ...EMPTY_CATEGORY_INPUT } };

  return {
    form: {
      name: loaded.name ?? "",
      // The form holds text, the column holds NULL: "nothing set" has to be one
      // value in the editor or the placeholder never shows.
      description: loaded.description ?? "",
      icon: loaded.icon ?? "",
      icon_color: loaded.icon_color ?? "",
      is_active: loaded.is_active ?? true,
    },
  };
}

export function validateCategoryInput(input: CategoryInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || input.name.trim().length < MIN_NAME_LENGTH) {
    errors.name = `Name must be at least ${MIN_NAME_LENGTH} characters`;
  }

  // The storefront resolves `lucide:*` through a static map and renders NOTHING
  // for a name it does not know, so an unvetted name is a silently blank icon.
  // Refusing at write time is the whole point of the curated catalog.
  if (!isKnownCategoryIcon(input.icon)) {
    errors.icon = "Pick an icon from the library, or use a single emoji";
  }

  if (!isValidCategoryIconColor(input.icon_color)) {
    errors.icon_color = "Icon colour must be a hex colour like #FF6B00";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function assertValid(input: CategoryInput): void {
  const { valid, errors } = validateCategoryInput(input);
  if (!valid) throw new Error(Object.values(errors).join("; "));
}

/**
 * Move one category one place up or down, renumbering every position.
 *
 * `order` is what the storefront sorts by, so a swap that reordered the array
 * without renumbering would look correct on this screen and change nothing on
 * the customer's menu. Pure: the caller's list is left untouched.
 */
export function moveCategory(
  categories: readonly ManagedCategory[],
  id: string,
  direction: MoveDirection,
): ManagedCategory[] {
  const from = categories.findIndex((c) => c.id === id);
  const to = direction === "up" ? from - 1 : from + 1;

  const reindex = (list: readonly ManagedCategory[]) =>
    list.map((category, index) => ({ ...category, order: index }));

  if (from === -1 || to < 0 || to >= categories.length) return reindex(categories);

  const reordered = [...categories];
  reordered[from] = categories[to];
  reordered[to] = categories[from];
  return reindex(reordered);
}

const MANAGED_COLUMNS = "id, tenant_id, name, description, icon, icon_color, \"order\", is_active";

/** Blank text is stored as NULL, so "nothing set" is one value rather than two. */
function blankToNull(value: string): string | null {
  return value.trim() || null;
}

/** The row payload for a field edit — the five columns this app's form owns. */
function toRow(input: CategoryInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    description: blankToNull(input.description),
    icon: blankToNull(input.icon),
    icon_color: blankToNull(input.icon_color),
    is_active: input.is_active,
  };
}

/**
 * Every category the store has set up, in menu order.
 *
 * Nothing is filtered: a hidden category is exactly the row the merchant opened
 * this screen to find and switch back on, and dropping it would read as the
 * category having been deleted.
 */
export async function listManagedCategories(tenantId: string): Promise<ManagedCategory[]> {
  const { data, error } = await supabase
    .from("categories")
    .select(MANAGED_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("order", { ascending: true });

  // Not swallowed: an empty list after a failed read is the claim "this store
  // has no categories", which invites the merchant to build their menu again.
  if (error) throw error;
  return (data ?? []) as unknown as ManagedCategory[];
}

export async function getCategory(
  categoryId: string,
  tenantId: string,
): Promise<ManagedCategory | null> {
  const { data, error } = await supabase
    .from("categories")
    .select(MANAGED_COLUMNS)
    .eq("id", categoryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  return data ? (data as unknown as ManagedCategory) : null;
}

/** The position a newly added category takes: after everything already there. */
async function nextOrder(tenantId: string): Promise<number> {
  const { data, error } = await supabase
    .from("categories")
    .select("order")
    .eq("tenant_id", tenantId)
    .order("order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const highest = (data as { order?: number } | null)?.order;
  return highest === undefined || highest === null ? 0 : highest + 1;
}

export async function createCategory(
  tenantId: string,
  input: CategoryInput,
): Promise<ManagedCategory> {
  assertValid(input);

  const order = await nextOrder(tenantId);

  const { data, error } = await supabase
    .from("categories")
    .insert({ tenant_id: tenantId, ...toRow(input), order })
    .select(MANAGED_COLUMNS)
    .single();

  if (error) throw error;
  return data as unknown as ManagedCategory;
}

/** Writes the five form fields and nothing else — see this module's header. */
export async function updateCategory(
  categoryId: string,
  tenantId: string,
  input: CategoryInput,
): Promise<ManagedCategory> {
  assertValid(input);

  const { data, error } = await supabase
    .from("categories")
    .update(toRow(input))
    .eq("id", categoryId)
    .eq("tenant_id", tenantId)
    .select(MANAGED_COLUMNS)
    .single();

  if (error) throw error;
  return data as unknown as ManagedCategory;
}

/** Show or hide a whole section of the menu, without opening the editor. */
export async function toggleCategoryActive(
  categoryId: string,
  tenantId: string,
  isActive: boolean,
): Promise<ManagedCategory> {
  const { data, error } = await supabase
    .from("categories")
    .update({ is_active: isActive })
    .eq("id", categoryId)
    .eq("tenant_id", tenantId)
    .select(MANAGED_COLUMNS)
    .single();

  if (error) throw error;
  return data as unknown as ManagedCategory;
}

/**
 * How many dishes a delete would orphan.
 *
 * `menu_items.category_id` is `ON DELETE SET NULL`: deleting a category does
 * not delete its dishes, it leaves them belonging to no section — off the
 * storefront menu, which groups by category, while still sitting in the product
 * list. The screen asks this first so the confirmation can name the number
 * instead of the merchant discovering it on their own menu.
 */
export async function countProductsIn(categoryId: string, tenantId: string): Promise<number> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("category_id", categoryId);

  if (error) throw error;
  return (data ?? []).length;
}

export async function deleteCategory(categoryId: string, tenantId: string): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("tenant_id", tenantId);

  if (error) throw error;
}

/** Persist the positions produced by {@link moveCategory}. */
export async function reorderCategories(
  tenantId: string,
  categories: readonly ManagedCategory[],
): Promise<void> {
  for (const category of categories) {
    const { error } = await supabase
      .from("categories")
      .update({ order: category.order })
      .eq("id", category.id)
      .eq("tenant_id", tenantId);

    if (error) throw error;
  }
}
