import { supabase } from "./supabase";
import {
  buildOutletMenuIndex,
  resolveMenuForOutlet,
  type OutletMenuOverrideRow,
} from "./outlet-menu-overrides";
import {
  normalizeModifierGroups,
  splitGroupsToLegacyColumns,
  type ModifierGroup,
  type ModifierSource,
} from "./modifier-groups";

export interface Product {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  discounted_price: number | null;
  image_url: string;
  is_available: boolean;
  is_featured: boolean;
  order: number;
  /** Set when auto-86 hid this item; NULL means the merchant chose to. */
  auto_disabled_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
}

export interface ProductInput {
  name: string;
  description: string;
  price: number;
  discounted_price: number | null;
  image_url: string;
  category_id: string;
  is_available: boolean;
  is_featured: boolean;
  // Unified variations + add-ons. Optional so callers that never touch options
  // (e.g. the availability toggle) stay untouched and backward compatible.
  modifier_groups?: ModifierGroup[];
}

/** Pristine form values for adding a new product. */
export const EMPTY_PRODUCT_INPUT: ProductInput = {
  name: "",
  description: "",
  price: 0,
  discounted_price: null,
  image_url: "",
  category_id: "",
  is_available: true,
  is_featured: false,
};

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** All editor state derived from a loaded product (or a fresh add). */
export interface EditorFormState {
  form: ProductInput;
  priceText: string;
  discountedPriceText: string;
  modifierGroups: ModifierGroup[];
}

/**
 * Resolve the product editor's initial state from a loaded row, or a clean slate
 * when `loaded` is null.
 *
 * The editor screen is a persistent tab screen that never unmounts, so it is
 * reused when the user goes from editing a product to adding a new one. Passing
 * `null` here (the add path) returns a fresh {@link EMPTY_PRODUCT_INPUT} copy so
 * the previous product's data can never leak into the "New Product" form.
 */
export function buildEditorFormState(
  loaded: (Partial<Product> & ModifierSource) | null
): EditorFormState {
  if (!loaded) {
    return {
      form: { ...EMPTY_PRODUCT_INPUT },
      priceText: "",
      discountedPriceText: "",
      modifierGroups: [],
    };
  }

  const form: ProductInput = {
    name: loaded.name ?? "",
    description: loaded.description ?? "",
    price: loaded.price ?? 0,
    discounted_price: loaded.discounted_price ?? null,
    image_url: loaded.image_url ?? "",
    category_id: loaded.category_id ?? "",
    is_available: loaded.is_available ?? true,
    is_featured: loaded.is_featured ?? false,
  };

  return {
    form,
    priceText: String(form.price),
    discountedPriceText: form.discounted_price ? String(form.discounted_price) : "",
    modifierGroups: normalizeModifierGroups(loaded),
  };
}

const POSTGREST_SPECIAL_CHARS = /[%_\\*,.()!=><]/g;
const NON_WORD_CHARS = /[^\w\s-]/g;
const MAX_SEARCH_QUERY_LENGTH = 100;

export function validateProductInput(input: ProductInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || input.name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters";
  }

  if (!input.description || input.description.trim().length < 10) {
    errors.description = "Description must be at least 10 characters";
  }

  if (!(input.price > 0)) {
    errors.price = "Price must be positive";
  }

  if (!input.category_id) {
    errors.category_id = "Must select a category";
  }

  if (
    input.discounted_price !== null &&
    input.discounted_price !== undefined &&
    input.discounted_price >= input.price
  ) {
    errors.discounted_price = "Discounted price must be lower than the price";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Escapes PostgREST filter-special characters before an `ilike` search. */
export function sanitizeSearchQuery(query: string): string {
  return query
    .replace(POSTGREST_SPECIAL_CHARS, "")
    .replace(NON_WORD_CHARS, "")
    .trim()
    .slice(0, MAX_SEARCH_QUERY_LENGTH);
}

export interface Margin {
  profit: number;
  marginPercent: number | null;
}

export function calculateMargin(
  price: number,
  costPrice: number | null
): Margin | null {
  if (costPrice === null || costPrice === undefined) return null;

  const profit = price - costPrice;
  const marginPercent = price === 0 ? null : (profit / price) * 100;

  return { profit, marginPercent };
}

function assertValid(input: ProductInput): void {
  const { valid, errors } = validateProductInput(input);
  if (!valid) {
    throw new Error(Object.values(errors).join("; "));
  }
}

/**
 * Expand a product payload into the row actually written to `menu_items`.
 *
 * When the caller edited the options, `modifier_groups` is canonical and the
 * legacy `variation_types` / `variations` / `addons` columns are derived from it
 * — the customer storefront, white-labeled customer app and desktop POS still
 * read those columns, so an add-on saved without them would be invisible to
 * customers. An empty group list clears the legacy columns rather than leaving
 * stale data behind.
 *
 * Callers that never touch the options (the availability toggle) omit
 * `modifier_groups` entirely; their row is passed through untouched so a partial
 * update can never wipe a product's options.
 */
function toMenuItemRow(input: ProductInput): Record<string, unknown> {
  if (!input.modifier_groups) return { ...input };

  return { ...input, ...splitGroupsToLegacyColumns(input.modifier_groups) };
}

/**
 * The store's products, priced for one branch when the register belongs to one.
 *
 * Without `outletId` this is the store-wide menu, which is what a
 * single-location merchant has always seen. With it, the list is exactly what
 * that branch sells: dishes it does not carry are gone, its prices are its own,
 * and anything it has run out of comes back marked unavailable rather than
 * missing — so the cashier sees a greyed-out tile instead of wondering where a
 * dish went.
 */
export async function listProducts(
  tenantId: string,
  outletId?: string | null,
): Promise<Product[]> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*, category:categories(*)")
    .eq("tenant_id", tenantId)
    .order("order", { ascending: true });

  if (error) throw error;
  const products = (data ?? []) as unknown as Product[];

  if (!outletId) return products;

  const { data: overrideRows, error: overrideError } = await supabase
    .from("outlet_menu_items")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("outlet_id", outletId);

  // Not swallowed: an empty override set is the claim "this branch sells at the
  // store-wide price", which after a failed query rings up the wrong money.
  if (overrideError) throw overrideError;

  const index = buildOutletMenuIndex(
    (overrideRows ?? []) as unknown as OutletMenuOverrideRow[],
  );

  return resolveMenuForOutlet(products, index, outletId) as Product[];
}

export async function createProduct(
  tenantId: string,
  input: ProductInput
): Promise<Product> {
  assertValid(input);

  const { data, error } = await supabase
    .from("menu_items")
    .insert({ tenant_id: tenantId, ...toMenuItemRow(input) })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Product;
}

export async function updateProduct(
  productId: string,
  tenantId: string,
  input: ProductInput
): Promise<Product> {
  assertValid(input);

  const { data, error } = await supabase
    .from("menu_items")
    .update(toMenuItemRow(input))
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Product;
}

export async function deleteProduct(
  productId: string,
  tenantId: string
): Promise<void> {
  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", productId)
    .eq("tenant_id", tenantId);

  if (error) throw error;
}

export async function toggleProductAvailability(
  productId: string,
  tenantId: string,
  isAvailable: boolean
): Promise<Product> {
  const { data, error } = await supabase
    .from("menu_items")
    // Clearing `auto_disabled_at` hands ownership back to the merchant: stock
    // recovery re-enables only items still carrying the marker, so a dish the
    // merchant has just decided about must no longer carry it.
    .update({ is_available: isAvailable, auto_disabled_at: null })
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Product;
}

export async function listCategories(tenantId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Category[];
}
