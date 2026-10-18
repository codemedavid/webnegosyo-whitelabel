/**
 * Studio virtual fields over a flat jsonb column (key → value), the same idea
 * as storefront pack settings: each key is a field id `<column>.<key>`, so the
 * Studio's cascade, "is set" and undo work unchanged, and edits are folded
 * back into the whole column for publishing and for the preview (whose tenant
 * merge is a shallow spread, so it must always get the whole object).
 */

type Bag = Record<string, unknown> | null | undefined

export interface JsonColumnFields {
    column: string
    fieldId: (key: string) => string
    isFieldId: (fieldId: string) => boolean
    /** Saved values as virtual field values; unknown keys dropped. */
    flatten: (tenant: Bag) => Record<string, unknown>
    /** The whole column: saved values with the draft's edits on top; a cleared field is removed. */
    fold: (draft: Bag, tenant: Bag) => Record<string, unknown>
    /** The preview draft with the folded column when any of its fields were edited. */
    withPreview: <T extends Record<string, unknown>>(draft: T, tenant: Bag) => T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBlank(value: unknown): boolean {
    return value === undefined || value === null || value === ''
}

export function createJsonColumnFields(column: string, knownKeys: readonly string[]): JsonColumnFields {
    const prefix = `${column}.`
    const known = new Set(knownKeys)
    const keyOf = (fieldId: string) => (fieldId.startsWith(prefix) ? fieldId.slice(prefix.length) : null)

    const saved = (tenant: Bag): Record<string, unknown> => {
        const raw = tenant?.[column]
        if (!isPlainObject(raw)) return {}
        return Object.fromEntries(Object.entries(raw).filter(([key, value]) => known.has(key) && !isBlank(value)))
    }

    const fold = (draft: Bag, tenant: Bag): Record<string, unknown> => {
        const next = { ...saved(tenant) }
        for (const [fieldId, value] of Object.entries(draft ?? {})) {
            const key = keyOf(fieldId)
            if (!key || !known.has(key)) continue
            if (isBlank(value)) delete next[key]
            else next[key] = value
        }
        return next
    }

    return {
        column,
        fieldId: (key) => `${prefix}${key}`,
        isFieldId: (fieldId) => fieldId.startsWith(prefix),
        flatten: (tenant) => Object.fromEntries(Object.entries(saved(tenant)).map(([key, value]) => [`${prefix}${key}`, value])),
        fold,
        withPreview: (draft, tenant) =>
            Object.keys(draft).some((fieldId) => fieldId.startsWith(prefix)) ? { ...draft, [column]: fold(draft, tenant) } : draft,
    }
}
