import { supabase } from "./supabase";

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
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
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

export async function listProducts(tenantId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*, category:categories(*)")
    .eq("tenant_id", tenantId)
    .order("order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Product[];
}

export async function createProduct(
  tenantId: string,
  input: ProductInput
): Promise<Product> {
  assertValid(input);

  const { data, error } = await supabase
    .from("menu_items")
    .insert({ tenant_id: tenantId, ...input })
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
    .update(input)
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
    .update({ is_available: isAvailable })
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
