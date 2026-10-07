/**
 * Write a parsed menu (categories + items) into a store.
 *
 * Lifted out of `POST /api/tenants/[id]/bulk-menu-import` so server code (the
 * automated store onboarding) can import with an injected client. The CALLER
 * authorizes: the route passes its RLS-bound session client, the onboarding
 * pipeline its service-role client.
 *
 * Categories are de-duplicated by lower-cased name against what the store
 * already has. Items go in batches with one round trip each; a batch the
 * database refuses is retried row by row, so one bad item never sinks the rest.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ParsedMenuData, ParsedMenuItem } from '@/types/ai-menu-parser'

export interface ImportedMenuItem {
    id: string
    name: string
    price: number
    categoryName: string
}

export interface MenuImportResults {
    categoriesCreated: number
    categoriesSkipped: number
    itemsCreated: number
    itemsFailed: number
    errors: string[]
    createdItems: ImportedMenuItem[]
}

/** Rows per item insert. */
export const ITEM_INSERT_BATCH_SIZE = 50

interface MenuItemRow {
    tenant_id: string
    category_id: string
    name: string
    description: string
    price: number
    image_url: string
    variation_types: unknown[]
    variations: unknown[]
    addons: unknown[]
    is_available: boolean
    is_featured: boolean
    order: number
}

interface PendingItem {
    row: MenuItemRow
    categoryName: string
}

// The generated row types lag the columns these rows carry (variation_types,
// order), so the writes go through a loosely-typed view of the client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any }

function assertMenuData(menuData: unknown): asserts menuData is ParsedMenuData {
    const data = menuData as Partial<ParsedMenuData> | null
    if (!data || typeof data !== 'object' || !Array.isArray(data.categories) || !Array.isArray(data.items)) {
        throw new Error('Invalid menu data: expected { categories: [], items: [] }')
    }
}

function buildVariationTypes(item: ParsedMenuItem, stamp: string): unknown[] {
    return (item.variations ?? []).map((varType, vtIndex) => ({
        id: `vt-${stamp}-${vtIndex}`,
        name: varType.name,
        is_required: varType.isRequired,
        display_order: vtIndex,
        options: varType.options.map((opt, optIndex) => ({
            id: `opt-${stamp}-${vtIndex}-${optIndex}`,
            name: opt.name,
            price_modifier: opt.priceModifier,
            is_default: optIndex === 0,
            display_order: optIndex,
        })),
    }))
}

function buildAddons(item: ParsedMenuItem, stamp: string): unknown[] {
    return (item.addons ?? []).map((addon, addonIndex) => ({
        id: `addon-${stamp}-${addonIndex}`,
        name: addon.name,
        price: addon.price,
    }))
}

function buildDescription(item: ParsedMenuItem): string {
    let description = item.description || ''
    if (item.note) {
        description = description ? `${description}. ${item.note}` : item.note
    }
    return description || item.name // Fallback to name if no description
}

export function buildMenuItemRow(
    tenantId: string,
    categoryId: string,
    item: ParsedMenuItem,
    order: number,
    stamp: number = Date.now(),
): MenuItemRow {
    // Option and add-on ids must not repeat across items of one import.
    const key = `${stamp}-${order}`
    return {
        tenant_id: tenantId,
        category_id: categoryId,
        name: item.name,
        description: buildDescription(item),
        price: item.price,
        image_url: '', // No image for bulk import
        variation_types: buildVariationTypes(item, key),
        variations: [], // Legacy field, keep empty
        addons: buildAddons(item, key),
        is_available: true,
        is_featured: false,
        order,
    }
}

async function createCategories(
    client: LooseClient,
    tenantId: string,
    menuData: ParsedMenuData,
    results: MenuImportResults,
): Promise<Map<string, string>> {
    const { data: existingCategories, error } = await client
        .from('categories')
        .select('id, name')
        .eq('tenant_id', tenantId)
    if (error) throw new Error(`Could not read existing categories: ${error.message}`)

    const existing = (existingCategories ?? []) as Array<{ id: string; name: string }>
    const categoryMap = new Map<string, string>(existing.map((cat) => [cat.name.toLowerCase(), cat.id]))

    for (let i = 0; i < menuData.categories.length; i++) {
        const cat = menuData.categories[i]
        const lowerName = cat.name.toLowerCase()

        if (categoryMap.has(lowerName)) {
            results.categoriesSkipped++
            continue
        }

        const { data: newCat, error: catError } = await client
            .from('categories')
            .insert({
                tenant_id: tenantId,
                name: cat.name,
                description: cat.description || null,
                icon: cat.icon || null,
                order: existing.length + i,
                is_active: true,
            })
            .select('id')
            .single()

        if (catError) {
            results.errors.push(`Failed to create category "${cat.name}": ${catError.message}`)
        } else if (newCat) {
            categoryMap.set(lowerName, newCat.id)
            results.categoriesCreated++
        }
    }

    return categoryMap
}

/**
 * Count a batch the database accepted. The insert is atomic, so every row of
 * the batch exists; `rows` are the ones the client can read back (an RLS-bound
 * client may see fewer), matched to their batch entry by position when all
 * came back, by name otherwise.
 */
function recordCreated(
    results: MenuImportResults,
    batch: readonly PendingItem[],
    rows: ReadonlyArray<{ id: string; name: string; price: number }>,
): void {
    const isComplete = rows.length === batch.length
    const categoryByName = new Map(batch.map((p) => [p.row.name, p.categoryName]))
    rows.forEach((row, index) => {
        results.createdItems.push({
            id: row.id,
            name: row.name,
            price: Number(row.price),
            categoryName: (isComplete ? batch[index]?.categoryName : categoryByName.get(row.name)) ?? '',
        })
    })
    results.itemsCreated += batch.length
}

async function insertOneByOne(client: LooseClient, batch: readonly PendingItem[], results: MenuImportResults) {
    for (const pending of batch) {
        const { data, error } = await client.from('menu_items').insert(pending.row).select('id, name, price')
        if (error) {
            results.errors.push(`Failed to create item "${pending.row.name}": ${error.message}`)
            results.itemsFailed++
            continue
        }
        recordCreated(results, [pending], data ?? [])
    }
}

async function insertItems(client: LooseClient, pending: readonly PendingItem[], results: MenuImportResults) {
    for (let start = 0; start < pending.length; start += ITEM_INSERT_BATCH_SIZE) {
        const batch = pending.slice(start, start + ITEM_INSERT_BATCH_SIZE)
        const { data, error } = await client
            .from('menu_items')
            .insert(batch.map((p) => p.row))
            .select('id, name, price')

        // An insert is all-or-nothing: on a refusal nothing of this batch
        // exists, so retrying it row by row cannot duplicate anything.
        if (error) {
            await insertOneByOne(client, batch, results)
            continue
        }
        recordCreated(results, batch, data ?? [])
    }
}

export async function importParsedMenu(
    client: SupabaseClient<Database>,
    tenantId: string,
    menuData: ParsedMenuData,
): Promise<MenuImportResults> {
    assertMenuData(menuData)
    const loose = client as unknown as LooseClient

    const results: MenuImportResults = {
        categoriesCreated: 0,
        categoriesSkipped: 0,
        itemsCreated: 0,
        itemsFailed: 0,
        errors: [],
        createdItems: [],
    }

    const categoryMap = await createCategories(loose, tenantId, menuData, results)

    const stamp = Date.now()
    const pending: PendingItem[] = []
    menuData.items.forEach((item, index) => {
        const categoryId = categoryMap.get((item.category ?? '').toLowerCase())
        if (!categoryId) {
            results.errors.push(`Category not found for item "${item.name}": ${item.category}`)
            results.itemsFailed++
            return
        }
        pending.push({ row: buildMenuItemRow(tenantId, categoryId, item, index, stamp), categoryName: item.category })
    })

    await insertItems(loose, pending, results)
    return results
}
