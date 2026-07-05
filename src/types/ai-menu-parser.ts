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

export interface ParsedMenuData {
    categories: ParsedCategory[]
    items: ParsedMenuItem[]
}
