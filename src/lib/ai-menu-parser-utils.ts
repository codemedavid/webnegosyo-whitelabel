import type {
    ParsedAddon,
    ParsedAddonGroup,
    ParsedCategory,
    ParsedMenuData,
    ParsedMenuItem,
    ParsedVariationType,
} from '@/types/ai-menu-parser'

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

    const rest = { ...item }
    delete rest.description
    return rest
}

export function sanitizeParsedMenuData(data: ParsedMenuData): ParsedMenuData {
    return {
        ...data,
        items: data.items.map(sanitizeParsedMenuItem),
    }
}

/**
 * Coerces an AI-emitted price into a non-negative number. Handles numeric
 * strings with currency symbols and thousands separators ("₱1,350",
 * "P150.50", "+P20"). Anything unparseable or negative becomes 0.
 */
function coercePrice(value: unknown): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value >= 0 ? value : 0
    }
    if (typeof value === 'string') {
        const numeric = Number.parseFloat(value.replace(/[^\d.-]/g, ''))
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0
    }
    return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

function asNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeVariations(raw: unknown): ParsedVariationType[] {
    const variationTypes: ParsedVariationType[] = []
    for (const entry of asArray(raw)) {
        if (!isRecord(entry)) continue
        const name = asNonEmptyString(entry.name)
        if (!name) continue
        const options = asArray(entry.options)
            .filter(isRecord)
            .flatMap(option => {
                const optionName = asNonEmptyString(option.name)
                if (!optionName) return []
                return [{ name: optionName, priceModifier: coercePrice(option.priceModifier) }]
            })
        if (options.length === 0) continue
        variationTypes.push({ name, isRequired: entry.isRequired !== false, options })
    }
    return variationTypes
}

function normalizeAddons(raw: unknown): ParsedAddon[] {
    return asArray(raw)
        .filter(isRecord)
        .flatMap(addon => {
            const name = asNonEmptyString(addon.name)
            if (!name) return []
            return [{ name, price: coercePrice(addon.price) }]
        })
}

function normalizeCategories(raw: unknown): ParsedCategory[] {
    const categories: ParsedCategory[] = []
    const seen = new Set<string>()
    for (const entry of asArray(raw)) {
        if (!isRecord(entry)) continue
        const name = asNonEmptyString(entry.name)
        if (!name || seen.has(name.toLowerCase())) continue
        seen.add(name.toLowerCase())
        categories.push({
            name,
            ...(asNonEmptyString(entry.description) ? { description: asNonEmptyString(entry.description) } : {}),
            ...(asNonEmptyString(entry.icon) ? { icon: asNonEmptyString(entry.icon) } : {}),
        })
    }
    return categories
}

function normalizeAddonGroups(raw: unknown): ParsedAddonGroup[] {
    return asArray(raw)
        .filter(isRecord)
        .flatMap(group => {
            const name = asNonEmptyString(group.name)
            const appliesTo = asArray(group.appliesTo)
                .map(target => asNonEmptyString(target))
                .filter((target): target is string => Boolean(target))
            const addons = normalizeAddons(group.addons)
            if (!name || appliesTo.length === 0 || addons.length === 0) return []
            return [{ name, appliesTo, addons }]
        })
}

/**
 * Hardens raw AI output into a well-formed ParsedMenuData: coerces prices,
 * drops nameless items/categories/options, dedupes categories, and appends
 * any category an item references that the AI forgot to list.
 */
export function normalizeParsedMenuData(raw: unknown): ParsedMenuData {
    if (!isRecord(raw)) {
        return { categories: [], items: [] }
    }

    const categories = normalizeCategories(raw.categories)
    const knownCategories = new Set(categories.map(category => category.name.toLowerCase()))

    const items: ParsedMenuItem[] = asArray(raw.items)
        .filter(isRecord)
        .flatMap(entry => {
            const name = asNonEmptyString(entry.name)
            if (!name) return []
            const category = asNonEmptyString(entry.category) ?? 'Uncategorized'
            const variations = normalizeVariations(entry.variations)
            const addons = normalizeAddons(entry.addons)
            const item: ParsedMenuItem = {
                name,
                category,
                price: coercePrice(entry.price),
                ...(asNonEmptyString(entry.description) ? { description: asNonEmptyString(entry.description) } : {}),
                ...(variations.length > 0 ? { variations } : {}),
                ...(addons.length > 0 ? { addons } : {}),
                ...(asNonEmptyString(entry.note) ? { note: asNonEmptyString(entry.note) } : {}),
            }
            return [item]
        })

    const missingCategories: ParsedCategory[] = []
    for (const item of items) {
        const key = item.category.toLowerCase()
        if (!knownCategories.has(key)) {
            knownCategories.add(key)
            missingCategories.push({ name: item.category })
        }
    }

    const addonGroups = normalizeAddonGroups(raw.addonGroups)

    return {
        categories: [...categories, ...missingCategories],
        items,
        ...(addonGroups.length > 0 ? { addonGroups } : {}),
    }
}

function mergeGroupAddons(existing: ParsedAddon[] | undefined, groupAddons: ParsedAddon[]): ParsedAddon[] {
    const merged = [...(existing ?? [])]
    const seen = new Set(merged.map(addon => addon.name.toLowerCase()))
    for (const addon of groupAddons) {
        if (seen.has(addon.name.toLowerCase())) continue
        seen.add(addon.name.toLowerCase())
        merged.push(addon)
    }
    return merged
}

/**
 * Distributes shared `addonGroups` onto matching items (by category name,
 * item name, or "*" for all), deduping by addon name — an addon the item
 * already carries wins over the group's copy. Returns new data with
 * `addonGroups` consumed.
 */
export function applyAddonGroups(data: ParsedMenuData): ParsedMenuData {
    const groups = data.addonGroups ?? []
    const rest = { ...data }
    delete rest.addonGroups
    if (groups.length === 0) {
        return rest
    }

    const items = data.items.map(item => {
        const itemKeys = [item.category.toLowerCase(), item.name.toLowerCase()]
        const applicableAddons = groups
            .filter(group => group.appliesTo.some(target => {
                const key = target.toLowerCase()
                return key === '*' || key === 'all' || itemKeys.includes(key)
            }))
            .flatMap(group => group.addons)

        if (applicableAddons.length === 0) {
            return item
        }
        return { ...item, addons: mergeGroupAddons(item.addons, applicableAddons) }
    })

    return { ...rest, items }
}

/**
 * Full post-processing pipeline for raw AI parser output:
 * normalize → distribute shared addon groups → strip redundant descriptions.
 */
export function finalizeParsedMenuData(raw: unknown): ParsedMenuData {
    return sanitizeParsedMenuData(applyAddonGroups(normalizeParsedMenuData(raw)))
}
