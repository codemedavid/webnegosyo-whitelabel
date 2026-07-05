import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeParsedMenuData } from '@/lib/ai-menu-parser-utils'
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

const SYSTEM_PROMPT = `You are a menu data extraction assistant. Your job is to parse unstructured restaurant menu text and extract it into a structured JSON format.

Extract the following information:
1. Categories - group menu items logically (e.g., "Bakes", "Pastries", "Cakes", "Family Trays", etc.)
2. Menu Items - with name, description, price, variations, and add-ons

For prices:
- Extract the numeric value (e.g., "P150" → 150, "₱1,350" → 1350)
- If there are multiple price/size combinations, create variations

For variations (ANY selectable choice a customer must pick, whether or not it changes price):
- Create a "variation_types" array for EVERY choice-based option group — sizes, flavors, spice levels, milk options, "choose N from the following" combos, etc. Do not limit variations to price-driven sizes only.
- Each option has: name, priceModifier — usually base price is 0, others are the difference. If every option costs the same (e.g. a flavor pick with no upcharge), use priceModifier: 0 for all of them; still put them in "variations", not in the description.
- If the menu lists a "choose N of these M options" pattern, put the underlying choices in a single variation_type's options (with priceModifier reflecting any listed price difference), and use "isRequired": true.

CRITICAL — never duplicate variation data into description:
- Anything you already captured as a variation option (a flavor, size, combo, etc.) must NOT also be spelled out again inside "description". Never repeat the same list of choices in both places.
- "description" is for a short, genuinely descriptive sentence about the item (what it is, key ingredients) — never a restatement of the options already in "variations".
- Instructional text like "Choose any 3 from the following" belongs in "note", not "description", and should never be copied verbatim as if it were the description.
- If you cannot write a description that adds information beyond the variation names, omit the "description" field entirely rather than repeating the options.

Output ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "categories": [
    { "name": "Category Name", "description": "Optional description", "icon": "🍰" }
  ],
  "items": [
    {
      "name": "Item Name",
      "description": "Brief description that does not repeat variation option names",
      "category": "Category Name",
      "price": 100,
      "variations": [
        {
          "name": "Size",
          "isRequired": true,
          "options": [
            { "name": "Solo", "priceModifier": 0 },
            { "name": "Box of 6", "priceModifier": 200 }
          ]
        },
        {
          "name": "Flavor",
          "isRequired": true,
          "options": [
            { "name": "Strawberry", "priceModifier": 0 },
            { "name": "Lychee", "priceModifier": 0 },
            { "name": "Mango", "priceModifier": 0 }
          ]
        }
      ],
      "addons": [
        { "name": "Extra Cheese", "price": 50 }
      ],
      "note": "Any special notes about this item, e.g. 'Choose any 3 from the following'"
    }
  ]
}

Important rules:
- The base price should be the lowest/default option price
- Price modifier is the ADDITIONAL amount on top of base price (e.g., Solo is P100, Box of 6 is P300 → base=100, modifier for Box=200)
- If an item has no variations, omit the variations field
- Categories should use appropriate emoji icons
- Use descriptive categories from the menu (e.g., "Bakes / Banana Loaf" → category "Banana Loaf" under parent info in description)
- Keep descriptions concise but informative, and never a re-listing of variation options`

/**
 * POST /api/ai/parse-menu
 * Parses raw menu text using Llama 3.3 70B Instruct via OpenRouter
 */
export async function POST(request: NextRequest) {
    try {
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

        const body = await request.json()
        const { menuText } = body

        if (!menuText || typeof menuText !== 'string') {
            return NextResponse.json({ error: 'Menu text is required' }, { status: 400 })
        }

        // Limit input size to prevent abuse (50KB should be more than enough for any menu)
        const MAX_MENU_TEXT_LENGTH = 50000
        if (menuText.length > MAX_MENU_TEXT_LENGTH) {
            return NextResponse.json({ error: `Menu text too long. Maximum ${MAX_MENU_TEXT_LENGTH} characters allowed.` }, { status: 400 })
        }

        // Get OpenRouter API key from environment
        const apiKey = process.env.OPENROUTER_API_KEY
        if (!apiKey) {
            return NextResponse.json({
                error: 'OpenRouter API key not configured. Please set OPENROUTER_API_KEY environment variable.'
            }, { status: 500 })
        }

        // Call Llama 3.3 70B Instruct via OpenRouter with streaming to avoid timeout
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://webnegosyo.com',
                'X-Title': 'WebNegosyo Menu Parser',
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-3.3-70b-instruct',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Parse the following menu text into structured JSON:\n\n${menuText}` }
                ],
                temperature: 0.2,
                top_p: 0.7,
                max_tokens: 1024,
                stream: true,
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('[Parse Menu] OpenRouter API error:', errorText)
            return NextResponse.json({
                error: 'Failed to parse menu with AI. Please try again.'
            }, { status: 500 })
        }

        // Process the streaming response
        const reader = response.body?.getReader()
        if (!reader) {
            return NextResponse.json({
                error: 'Failed to read streaming response'
            }, { status: 500 })
        }

        const decoder = new TextDecoder()
        let aiContent = ''

        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split('\n').filter(line => line.trim() !== '')

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6)
                        if (data === '[DONE]') continue

                        try {
                            const parsed = JSON.parse(data)
                            const content = parsed.choices?.[0]?.delta?.content
                            if (content) {
                                aiContent += content
                            }
                        } catch {
                            // Skip malformed JSON chunks
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock()
        }

        if (!aiContent) {
            return NextResponse.json({
                error: 'No response from AI. Please try again.'
            }, { status: 500 })
        }

        // Parse the AI response as JSON
        try {
            // Clean up the response - remove any markdown code blocks if present
            let cleanedContent = aiContent.trim()
            if (cleanedContent.startsWith('```json')) {
                cleanedContent = cleanedContent.slice(7)
            } else if (cleanedContent.startsWith('```')) {
                cleanedContent = cleanedContent.slice(3)
            }
            if (cleanedContent.endsWith('```')) {
                cleanedContent = cleanedContent.slice(0, -3)
            }
            cleanedContent = cleanedContent.trim()

            const parsedMenu: ParsedMenuData = JSON.parse(cleanedContent)

            // Validate the structure
            if (!parsedMenu.categories || !Array.isArray(parsedMenu.categories)) {
                parsedMenu.categories = []
            }
            if (!parsedMenu.items || !Array.isArray(parsedMenu.items)) {
                parsedMenu.items = []
            }

            return NextResponse.json({
                success: true,
                data: sanitizeParsedMenuData(parsedMenu),
            })
        } catch (parseError) {
            console.error('[Parse Menu] JSON parse error:', parseError)
            console.error('[Parse Menu] Raw AI response:', aiContent)
            return NextResponse.json({
                error: 'AI response was not valid JSON. Please try again.',
            }, { status: 500 })
        }

    } catch (error) {
        console.error('[Parse Menu] Error:', error)
        return NextResponse.json({
            error: 'Failed to parse menu'
        }, { status: 500 })
    }
}
