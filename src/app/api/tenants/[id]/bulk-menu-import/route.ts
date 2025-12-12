'use server'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ParsedMenuData } from '@/app/api/ai/parse-menu/route'

/**
 * POST /api/tenants/[id]/bulk-menu-import
 * Imports parsed menu data into the database for a specific tenant
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tenantId } = await params

        // Verify user is superadmin
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: appUser } = await supabase
            .from('app_users')
            .select('role')
            .eq('user_id', user.id)
            .single() as { data: { role: string } | null }

        if (!appUser || appUser.role !== 'superadmin') {
            return NextResponse.json({ error: 'Superadmin access required' }, { status: 403 })
        }

        // Verify tenant exists
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('id', tenantId)
            .single() as { data: { id: string; name: string } | null; error: unknown }

        if (tenantError || !tenant) {
            return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
        }

        const body = await request.json()
        const menuData: ParsedMenuData = body.menuData

        if (!menuData || !menuData.categories || !menuData.items) {
            return NextResponse.json({ error: 'Invalid menu data' }, { status: 400 })
        }

        const results = {
            categoriesCreated: 0,
            categoriesSkipped: 0,
            itemsCreated: 0,
            itemsFailed: 0,
            errors: [] as string[],
        }

        // Get existing categories for this tenant
        const { data: existingCategories } = await supabase
            .from('categories')
            .select('id, name')
            .eq('tenant_id', tenantId) as { data: { id: string; name: string }[] | null }

        const categoryMap = new Map<string, string>()
        existingCategories?.forEach(cat => {
            categoryMap.set(cat.name.toLowerCase(), cat.id)
        })

        // Create new categories
        for (let i = 0; i < menuData.categories.length; i++) {
            const cat = menuData.categories[i]
            const lowerName = cat.name.toLowerCase()

            if (categoryMap.has(lowerName)) {
                results.categoriesSkipped++
                continue
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: newCat, error: catError } = await (supabase as any)
                .from('categories')
                .insert({
                    tenant_id: tenantId,
                    name: cat.name,
                    description: cat.description || null,
                    icon: cat.icon || null,
                    order: existingCategories ? existingCategories.length + i : i,
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

        // Create menu items
        for (let i = 0; i < menuData.items.length; i++) {
            const item = menuData.items[i]

            // Find category ID
            const categoryId = categoryMap.get(item.category.toLowerCase())
            if (!categoryId) {
                results.errors.push(`Category not found for item "${item.name}": ${item.category}`)
                results.itemsFailed++
                continue
            }

            // Build variation_types structure if variations exist
            let variationTypes: unknown[] = []
            if (item.variations && item.variations.length > 0) {
                variationTypes = item.variations.map((varType, vtIndex) => ({
                    id: `vt-${Date.now()}-${vtIndex}`,
                    name: varType.name,
                    is_required: varType.isRequired,
                    display_order: vtIndex,
                    options: varType.options.map((opt, optIndex) => ({
                        id: `opt-${Date.now()}-${vtIndex}-${optIndex}`,
                        name: opt.name,
                        price_modifier: opt.priceModifier,
                        is_default: optIndex === 0,
                        display_order: optIndex,
                    }))
                }))
            }

            // Build addons structure if addons exist
            const addons = (item.addons || []).map((addon, addonIndex) => ({
                id: `addon-${Date.now()}-${addonIndex}`,
                name: addon.name,
                price: addon.price,
            }))

            // Build description
            let description = item.description || ''
            if (item.note) {
                description = description ? `${description}. ${item.note}` : item.note
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: itemError } = await (supabase as any)
                .from('menu_items')
                .insert({
                    tenant_id: tenantId,
                    category_id: categoryId,
                    name: item.name,
                    description: description || item.name, // Fallback to name if no description
                    price: item.price,
                    image_url: '', // No image for bulk import
                    variation_types: variationTypes,
                    variations: [], // Legacy field, keep empty
                    addons: addons,
                    is_available: true,
                    is_featured: false,
                    order: i,
                })

            if (itemError) {
                results.errors.push(`Failed to create item "${item.name}": ${itemError.message}`)
                results.itemsFailed++
            } else {
                results.itemsCreated++
            }
        }

        return NextResponse.json({
            success: true,
            message: `Import complete for ${tenant.name}`,
            results,
        })

    } catch (error) {
        console.error('[Bulk Menu Import] Error:', error)
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to import menu'
        }, { status: 500 })
    }
}
