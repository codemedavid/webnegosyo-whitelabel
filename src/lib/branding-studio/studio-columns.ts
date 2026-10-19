/**
 * The jsonb columns the Studio edits as virtual fields: the store's label
 * wording, the per-section colour styles and the order page / loyalty card
 * look. Shared by the draft engine, the saved overlay and the preview so all
 * three fold them the same way.
 */

import { STOREFRONT_LABEL_KEYS } from '@/lib/storefront-labels'
import { STYLED_SECTIONS } from '@/lib/section-schemes'
import { createJsonColumnFields, type JsonColumnFields } from '@/lib/branding-studio/json-column-fields'
import { TRACKING_STYLE_KEYS } from '@/lib/tracking-style/keys'

type Bag = Record<string, unknown> | null | undefined

export const JSON_COLUMNS: readonly JsonColumnFields[] = [
    createJsonColumnFields('storefront_labels', STOREFRONT_LABEL_KEYS),
    createJsonColumnFields('section_schemes', STYLED_SECTIONS),
    createJsonColumnFields('tracking_style', TRACKING_STYLE_KEYS),
]

export function isJsonColumnFieldId(fieldId: string): boolean {
    return JSON_COLUMNS.some((column) => column.isFieldId(fieldId))
}

/** Saved column values exposed as virtual field values. */
export function flattenJsonColumns(tenant: Bag): Record<string, unknown> {
    return Object.assign({}, ...JSON_COLUMNS.map((column) => column.flatten(tenant)))
}

/** The whole column value for every column one of `fieldIds` belongs to. */
export function foldedJsonColumns(fieldIds: readonly string[], draft: Bag, tenant: Bag): Record<string, unknown> {
    return Object.fromEntries(
        JSON_COLUMNS.filter((column) => fieldIds.some(column.isFieldId)).map((column) => [column.column, column.fold(draft, tenant)])
    )
}

/** The preview draft with every edited column folded in whole. */
export function withJsonColumnsPreview<T extends Record<string, unknown>>(draft: T, tenant: Bag): T {
    return JSON_COLUMNS.reduce((next, column) => column.withPreview(next, tenant), draft)
}
