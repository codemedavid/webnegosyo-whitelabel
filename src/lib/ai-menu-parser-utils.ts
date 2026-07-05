import type { ParsedMenuData, ParsedMenuItem, ParsedVariationType } from '@/types/ai-menu-parser'

// Splits on the bullet/comma/pipe/slash separators the LLM uses when it
// dumps a flavor or combo list as prose (e.g. "Strawberry • Lychee • Mango").
const LIST_SEPARATOR = /[•|·,/]+/

function normalize(token: string): string {
    return token.trim().toLowerCase()
}

function splitToTokens(text: string): string[] {
    return text.split(LIST_SEPARATOR).map(normalize).filter(Boolean)
}

function collectOptionTokens(variations: ParsedVariationType[]): Set<string> {
    const tokens = new Set<string>()
    for (const variationType of variations) {
        for (const option of variationType.options) {
            for (const token of splitToTokens(option.name)) {
                tokens.add(token)
            }
        }
    }
    return tokens
}

/**
 * Removes a description that is just a re-listing of the item's own
 * variation options (a known AI-parser failure mode where flavor/combo
 * choices already captured in `variations` also get dumped into
 * `description` as prose). Leaves genuinely descriptive text untouched.
 */
export function sanitizeParsedMenuItem(item: ParsedMenuItem): ParsedMenuItem {
    if (!item.description || !item.variations || item.variations.length === 0) {
        return item
    }

    const optionTokens = collectOptionTokens(item.variations)
    if (optionTokens.size === 0) {
        return item
    }

    const descriptionTokens = splitToTokens(item.description)
    // A single segment is never treated as a dumped list, even if it
    // happens to match an option name (e.g. description "Spicy").
    if (descriptionTokens.length < 2) {
        return item
    }

    const isRedundantListing = descriptionTokens.every(token => optionTokens.has(token))
    if (!isRedundantListing) {
        return item
    }

    const { description: _redundantDescription, ...rest } = item
    return rest
}

export function sanitizeParsedMenuData(data: ParsedMenuData): ParsedMenuData {
    return {
        ...data,
        items: data.items.map(sanitizeParsedMenuItem),
    }
}
