// Shared types for AI menu parsing (superadmin bulk menu import feature).
// Extracted so the parser prompt route and sanitizer utilities can both
// depend on these shapes without importing from each other.

export interface ParsedCategory {
    name: string
    description?: string
    icon?: string
}

export interface ParsedVariation {
    name: string
    priceModifier: number
}

export interface ParsedVariationType {
    name: string
    isRequired: boolean
    options: ParsedVariation[]
}

export interface ParsedAddon {
    name: string
    price: number
}

export interface ParsedMenuItem {
    name: string
    description?: string
    category: string // Category name reference
    price: number
    variations?: ParsedVariationType[]
    addons?: ParsedAddon[]
    note?: string
}

/**
 * A shared add-on section extracted once from the menu (e.g. "Add-ons for
 * all milk teas: Pearls P20, Cream Cheese P30"). `appliesTo` holds category
 * or item names, or ["*"] for every item. Distributed onto items by
 * `applyAddonGroups` before import.
 */
export interface ParsedAddonGroup {
    name: string
    appliesTo: string[]
    addons: ParsedAddon[]
}

export interface ParsedMenuData {
    categories: ParsedCategory[]
    items: ParsedMenuItem[]
    addonGroups?: ParsedAddonGroup[]
}
