import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConsoleCaller } from '@/lib/platform-staff/guard'
import { hasPlatformPermission } from '@/lib/platform-staff/permissions'
import type { ParsedMenuData } from '@/types/ai-menu-parser'
import { importParsedMenu } from '@/lib/menu-import/import-parsed-menu'

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

        // Verify the console caller may add menu data to a store. The writes
        // below stay on the session client: RLS admits platform staff to
        // categories/menu_items only with stores.create.
        const caller = await getConsoleCaller()

        if (!caller) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasPlatformPermission(caller.appUser, 'stores.create')) {
            return NextResponse.json({ error: 'You do not have access to import menus' }, { status: 403 })
        }

        const supabase = await createClient()

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

        const results = await importParsedMenu(supabase, tenantId, menuData)

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
