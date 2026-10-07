import { NextRequest, NextResponse } from 'next/server'
import { getConsoleCaller } from '@/lib/platform-staff/guard'
import { hasPlatformPermission } from '@/lib/platform-staff/permissions'
import { validateParseMenuRequest } from '@/lib/ai-menu-parser-request'
import { parseMenuWithAi } from '@/lib/menu-import/parse-menu-ai'
import type {
    ParsedCategory,
    ParsedVariation,
    ParsedVariationType,
    ParsedAddon,
    ParsedMenuItem,
    ParsedMenuData,
} from '@/types/ai-menu-parser'

// Re-exported for backward compatibility with existing imports of these types
// from this route module (e.g. the bulk-menu-import route).
export type {
    ParsedCategory,
    ParsedVariation,
    ParsedVariationType,
    ParsedAddon,
    ParsedMenuItem,
    ParsedMenuData,
}

/**
 * POST /api/ai/parse-menu
 * Parses raw menu text and/or menu photos into structured menu data using
 * a vision-capable model via OpenRouter. Console `stores.create` only.
 */
export async function POST(request: NextRequest) {
    try {
        // Verify the console caller may add menu data to a store
        const caller = await getConsoleCaller()

        if (!caller) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasPlatformPermission(caller.appUser, 'stores.create')) {
            return NextResponse.json({ error: 'You do not have access to import menus' }, { status: 403 })
        }

        const validation = validateParseMenuRequest(await request.json())
        if (!validation.ok) {
            return NextResponse.json({ error: validation.error }, { status: 400 })
        }

        const result = await parseMenuWithAi({
            text: validation.input.menuText,
            images: validation.input.images,
        })
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: result.status })
        }

        return NextResponse.json({
            success: true,
            data: result.data,
        })

    } catch (error) {
        console.error('[Parse Menu] Error:', error)
        return NextResponse.json({
            error: 'Failed to parse menu'
        }, { status: 500 })
    }
}
