// Pure request/response plumbing for POST /api/ai/parse-menu.
// Kept free of Next.js imports so it can be unit tested directly.

/** Vision-capable model used for both text and menu-photo parsing. */
export const PARSE_MENU_MODEL = 'google/gemma-4-26b-a4b-it'

export const MAX_MENU_TEXT_LENGTH = 50_000
export const MAX_MENU_IMAGES = 3
/**
 * Max data-URL length per image (~4MB of binary ≈ 5.4M base64 chars,
 * rounded up for headroom).
 */
export const MAX_IMAGE_DATA_URL_LENGTH = 6_000_000
/** Real menus can be large; 1k tokens truncated them. */
export const PARSE_MENU_MAX_TOKENS = 8_192

const ALLOWED_IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/

export const PARSE_MENU_SYSTEM_PROMPT = `You are an expert restaurant menu digitization assistant. You read restaurant menus (as plain text or photos) and extract every category, item, price, variation, and add-on into structured JSON.

Extract:
1. Categories — group menu items logically (e.g., "Bakes", "Pastries", "Milk Tea", "Family Trays").
2. Menu Items — name, description, category, base price, variations, and add-ons.
3. Shared add-on sections — see "addonGroups" below.

For prices:
- Extract the numeric value only (e.g., "P150" → 150, "₱1,350" → 1350).
- The base price is the lowest/default option price.
- If there are multiple price/size combinations, create variations.

For variations (ANY selectable choice a customer must pick, whether or not it changes the price):
- Create a "variations" entry for EVERY choice-based option group — sizes, flavors, spice levels, milk options, "choose N from the following" combos, etc. Do not limit variations to price-driven sizes only.
- Each option has: name, priceModifier. The default/base option has priceModifier 0; others are the DIFFERENCE from the base price (e.g., Solo is P100, Box of 6 is P300 → base=100, Box of 6 modifier=200). If every option costs the same (e.g., a flavor pick with no upcharge), use priceModifier 0 for all of them — still put them in "variations", never in the description.
- For a "choose N of these M options" pattern, put the underlying choices in a single variation group's options and set "isRequired": true. Put the instruction (e.g. "Choose any 3") in "note".

For add-ons — attach them to the RIGHT products:
- If an add-on is listed under a specific item, put it in that item's "addons".
- If the menu has a shared add-on section that applies to a whole category or several items (e.g., "Add-ons for all milk teas: Pearls P20, Cream Cheese P30" or "Extra rice P25 — available with all rice meals"), do NOT copy it onto every item. Instead emit one entry in the top-level "addonGroups" array with "appliesTo" listing the exact category names (or item names) it applies to. Use "appliesTo": ["*"] only when the menu says the add-ons apply to everything.
- Only include add-ons that genuinely make sense for the products they are attached to (a drink topping never applies to a cake).

For descriptions — make customers crave the item:
- ALWAYS write a short, appetizing, craving-inducing description for every item: 1–2 sentences, sensory and concrete (texture, aroma, key ingredients, how it's served). Write it like the merchant proudly describing their food.
- Only mention ingredients that are stated on the menu or clearly implied by the item's name — never invent specific ingredients.
- NEVER re-list variation options (flavors, sizes, combos) inside the description; those live in "variations" only.
- Instructional text like "Choose any 3 from the following" belongs in "note", never in "description".

Output ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "categories": [
    { "name": "Category Name", "description": "Optional description", "icon": "🍰" }
  ],
  "items": [
    {
      "name": "Item Name",
      "description": "Short appetizing description that never repeats variation option names",
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
        }
      ],
      "addons": [
        { "name": "Extra Cheese", "price": 50 }
      ],
      "note": "Any special note, e.g. 'Choose any 3 from the following'"
    }
  ],
  "addonGroups": [
    {
      "name": "Milk Tea Add-ons",
      "appliesTo": ["Milk Tea"],
      "addons": [
        { "name": "Pearls", "price": 20 },
        { "name": "Cream Cheese", "price": 30 }
      ]
    }
  ]
}

Important rules:
- Categories should use appropriate emoji icons.
- Extract EVERY item you can see — do not skip or summarize.
- If an item has no variations or add-ons, omit those fields.
- Omit "addonGroups" entirely when the menu has no shared add-on sections.`

export interface ParseMenuInput {
    menuText: string
    images: string[]
}

export type ParseMenuValidation =
    | { ok: true; input: ParseMenuInput }
    | { ok: false; error: string }

/** Validates the parse-menu request body: text and/or menu-photo data URLs. */
export function validateParseMenuRequest(body: unknown): ParseMenuValidation {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return { ok: false, error: 'Invalid request body' }
    }

    const { menuText, images } = body as { menuText?: unknown; images?: unknown }

    const text = typeof menuText === 'string' ? menuText : ''
    if (text.length > MAX_MENU_TEXT_LENGTH) {
        return { ok: false, error: `Menu text too long. Maximum ${MAX_MENU_TEXT_LENGTH} characters allowed.` }
    }

    if (images !== undefined && !Array.isArray(images)) {
        return { ok: false, error: 'Images must be an array of data URLs' }
    }
    const imageList = (images ?? []) as unknown[]
    if (imageList.length > MAX_MENU_IMAGES) {
        return { ok: false, error: `Too many images. Maximum ${MAX_MENU_IMAGES} allowed.` }
    }
    for (const image of imageList) {
        if (typeof image !== 'string' || !ALLOWED_IMAGE_DATA_URL.test(image)) {
            return { ok: false, error: 'Images must be PNG, JPEG, or WebP data URLs' }
        }
        if (image.length > MAX_IMAGE_DATA_URL_LENGTH) {
            return { ok: false, error: 'Each image must be under 4MB' }
        }
    }

    if (!text.trim() && imageList.length === 0) {
        return { ok: false, error: 'Provide menu text or at least one menu image' }
    }

    return { ok: true, input: { menuText: text.trim(), images: imageList as string[] } }
}

interface TextContentPart {
    type: 'text'
    text: string
}

interface ImageContentPart {
    type: 'image_url'
    image_url: { url: string }
}

export type ChatContentPart = TextContentPart | ImageContentPart

export interface ChatMessage {
    role: 'system' | 'user'
    content: string | ChatContentPart[]
}

/**
 * Builds the OpenRouter chat messages. Text-only input stays a plain string
 * message; images produce multimodal content parts.
 */
export function buildParseMenuMessages(input: ParseMenuInput): ChatMessage[] {
    const system: ChatMessage = { role: 'system', content: PARSE_MENU_SYSTEM_PROMPT }

    if (input.images.length === 0) {
        return [
            system,
            {
                role: 'user',
                content: `Parse the following menu text into structured JSON:\n\n${input.menuText}`,
            },
        ]
    }

    const instruction = input.menuText
        ? `Parse the attached menu image(s) into structured JSON. Additional notes from the merchant:\n\n${input.menuText}`
        : 'Parse the attached menu image(s) into structured JSON. Read every item, price, variation, and add-on visible in the images.'

    return [
        system,
        {
            role: 'user',
            content: [
                { type: 'text', text: instruction },
                ...input.images.map((url): ImageContentPart => ({ type: 'image_url', image_url: { url } })),
            ],
        },
    ]
}

/**
 * Pulls the first balanced JSON object out of a model response, tolerating
 * code fences and surrounding prose. Returns null when nothing parses.
 */
export function extractJsonFromAiResponse(raw: string): unknown | null {
    const withoutFences = raw.replace(/```(?:json)?/gi, '')
    const start = withoutFences.indexOf('{')
    if (start === -1) {
        return null
    }

    let depth = 0
    let inString = false
    let isEscaped = false
    for (let i = start; i < withoutFences.length; i++) {
        const char = withoutFences[i]
        if (isEscaped) {
            isEscaped = false
            continue
        }
        if (char === '\\') {
            if (inString) isEscaped = true
            continue
        }
        if (char === '"') {
            inString = !inString
            continue
        }
        if (inString) continue
        if (char === '{') depth++
        if (char === '}') {
            depth--
            if (depth === 0) {
                try {
                    return JSON.parse(withoutFences.slice(start, i + 1))
                } catch {
                    return null
                }
            }
        }
    }
    return null
}
