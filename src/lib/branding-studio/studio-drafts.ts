/**
 * The Branding Studio's draft — every unpublished edit across the stores it
 * writes — with undo/redo, a change list and diff-only publish payloads
 * (brand editor v2, Phase 1). Pure, so the safety net is tested apart from
 * the editor UI.
 *
 * Stores:
 *  - tenant / product: column values (`tenants`, `product_detail_settings`)
 *  - mobile / mobileProduct: per-phone overrides (their `mobile_overrides`)
 *  - categories: Menu Layout's arrangement draft
 */

import { BRANDING_FIELD_INDEX } from '@/lib/branding-registry'
import { PRODUCT_DETAIL_FIELD_INDEX } from '@/lib/product-detail-registry'
import { VALID_DB_COLUMNS } from '@/lib/product-detail-settings-utils'
import { mergeMobileOverrides, type OverrideMap } from '@/lib/mobile-overrides'
import { foldPackSettings, isPackFieldId } from '@/lib/storefront-pack-studio'
import { foldedJsonColumns, isJsonColumnFieldId } from '@/lib/branding-studio/studio-columns'
import { hasCategoryDraftChanges, type CategoryStudioDraft } from '@/lib/category-studio'

type Bag = Record<string, unknown>

export type ValueStore = 'tenant' | 'product' | 'mobile' | 'mobileProduct'
export type ChangeStore = ValueStore | 'categories'

export interface StudioDrafts {
    tenant: Bag
    product: Bag
    mobile: Bag
    mobileProduct: Bag
    categories: CategoryStudioDraft
}

/** What is published right now, per value store. */
export type SavedStores = Record<ValueStore, Bag>

export const EMPTY_DRAFTS: StudioDrafts = Object.freeze({
    tenant: {},
    product: {},
    mobile: {},
    mobileProduct: {},
    categories: {},
}) as StudioDrafts

// ---------- history ----------

/** Edits with the same key this close together are one undo step (a colour drag, typing). */
const COALESCE_WINDOW_MS = 800
const MAX_HISTORY = 100

export interface StudioHistory {
    present: StudioDrafts
    past: StudioDrafts[]
    future: StudioDrafts[]
    lastKey: string | null
    lastAt: number
}

export function createHistory(present: StudioDrafts = EMPTY_DRAFTS): StudioHistory {
    return { present, past: [], future: [], lastKey: null, lastAt: Number.NEGATIVE_INFINITY }
}

export interface CommitOptions {
    /** Same key within the coalesce window replaces the last step instead of adding one. */
    key: string | null
    at: number
}

export function commit(history: StudioHistory, next: StudioDrafts, { key, at }: CommitOptions): StudioHistory {
    if (next === history.present) return history
    const isSameGesture = key !== null && key === history.lastKey && at - history.lastAt <= COALESCE_WINDOW_MS
    const past = isSameGesture ? history.past : [...history.past, history.present].slice(-MAX_HISTORY)
    return { present: next, past, future: [], lastKey: key, lastAt: at }
}

export function undo(history: StudioHistory): StudioHistory {
    if (history.past.length === 0) return history
    const previous = history.past[history.past.length - 1]
    return {
        present: previous,
        past: history.past.slice(0, -1),
        future: [history.present, ...history.future],
        lastKey: null,
        lastAt: Number.NEGATIVE_INFINITY,
    }
}

export function redo(history: StudioHistory): StudioHistory {
    if (history.future.length === 0) return history
    const [next, ...future] = history.future
    return {
        present: next,
        past: [...history.past, history.present],
        future,
        lastKey: null,
        lastAt: Number.NEGATIVE_INFINITY,
    }
}

// ---------- edits ----------

function isBlank(value: unknown): boolean {
    return value === undefined || value === null || value === ''
}

function withStore(drafts: StudioDrafts, store: ValueStore, bag: Bag): StudioDrafts {
    return { ...drafts, [store]: bag }
}

export function setValue(drafts: StudioDrafts, store: ValueStore, fieldId: string, value: unknown): StudioDrafts {
    return withStore(drafts, store, { ...drafts[store], [fieldId]: value })
}

export function setValues(drafts: StudioDrafts, store: ValueStore, values: Bag): StudioDrafts {
    return withStore(drafts, store, { ...drafts[store], ...values })
}

export function setCategories(drafts: StudioDrafts, categories: CategoryStudioDraft): StudioDrafts {
    return { ...drafts, categories }
}

/** Columns the save schema requires a value for: clearing them means "back to default". */
const REQUIRED_TENANT_COLUMNS = new Set(['primary_color', 'secondary_color'])

function fieldFor(store: ValueStore, fieldId: string) {
    return store === 'product' || store === 'mobileProduct'
        ? PRODUCT_DETAIL_FIELD_INDEX[fieldId]
        : BRANDING_FIELD_INDEX[fieldId]
}

/**
 * The value that clears a saved column. Text and colour columns clear with ''.
 * Toggles, choices and numbers can't be '' (the save schema refuses it), so
 * they go back to their default. Phone overrides always clear with '' — that
 * removes the override and the phone follows the computer value again.
 */
function clearedValue(store: ValueStore, fieldId: string): unknown {
    if (store === 'mobile' || store === 'mobileProduct') return ''
    const field = fieldFor(store, fieldId)
    const mustHaveValue = store === 'tenant' && REQUIRED_TENANT_COLUMNS.has(fieldId)
    if (field && (mustHaveValue || field.type === 'toggle' || field.type === 'select' || field.type === 'number')) {
        return field.default
    }
    return ''
}

export function clearValues(drafts: StudioDrafts, store: ValueStore, fieldIds: readonly string[], saved: SavedStores): StudioDrafts {
    const next: Bag = { ...drafts[store] }
    for (const fieldId of fieldIds) {
        if (isBlank(saved[store][fieldId])) delete next[fieldId]
        else next[fieldId] = clearedValue(store, fieldId)
    }
    return withStore(drafts, store, next)
}

export function clearValue(drafts: StudioDrafts, store: ValueStore, fieldId: string, saved: SavedStores): StudioDrafts {
    return clearValues(drafts, store, [fieldId], saved)
}

export function revertChange(drafts: StudioDrafts, store: ChangeStore, fieldId: string): StudioDrafts {
    if (store === 'categories') return { ...drafts, categories: {} }
    const next: Bag = { ...drafts[store] }
    delete next[fieldId]
    return withStore(drafts, store, next)
}

// ---------- change list ----------

export interface StudioChange {
    store: ChangeStore
    fieldId: string
    label: string
    before: unknown
    after: unknown
}

function sameValue(a: unknown, b: unknown): boolean {
    if (isBlank(a) && isBlank(b)) return true
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
    return a === b
}

const STORE_PREFIX: Record<ValueStore, string> = {
    tenant: '',
    product: 'Item page · ',
    mobile: 'Phone · ',
    mobileProduct: 'Phone · Item page · ',
}

const VALUE_STORES: readonly ValueStore[] = ['tenant', 'product', 'mobile', 'mobileProduct']

function changedFieldIds(drafts: StudioDrafts, saved: SavedStores, store: ValueStore): string[] {
    return Object.keys(drafts[store]).filter((fieldId) => !sameValue(drafts[store][fieldId], saved[store][fieldId]))
}

/** Every unpublished change, in store order. A draft equal to what is saved is not a change. */
export function listChanges(drafts: StudioDrafts, saved: SavedStores): StudioChange[] {
    const valueChanges = VALUE_STORES.flatMap((store) =>
        changedFieldIds(drafts, saved, store).map((fieldId) => ({
            store,
            fieldId,
            label: `${STORE_PREFIX[store]}${fieldFor(store, fieldId)?.label ?? fieldId}`,
            before: saved[store][fieldId],
            after: drafts[store][fieldId],
        }))
    )
    const categoryChanges: StudioChange[] = hasCategoryDraftChanges(drafts.categories)
        ? [{ store: 'categories', fieldId: 'categories', label: 'Menu layout', before: null, after: null }]
        : []
    return [...valueChanges, ...categoryChanges]
}

// ---------- publish ----------

/**
 * The tenant columns to write: only what changed, plus the folded pack
 * settings when a pack field changed and the merged phone overrides when a
 * phone override changed. Null when the store has nothing to publish.
 */
export function tenantPublishPatch(drafts: StudioDrafts, saved: SavedStores): Bag | null {
    const changed = changedFieldIds(drafts, saved, 'tenant')
    const columns = Object.fromEntries(
        changed
            .filter((fieldId) => !isPackFieldId(fieldId) && !isJsonColumnFieldId(fieldId))
            .map((fieldId) => [fieldId, drafts.tenant[fieldId]])
    )
    const packPatch = changed.some(isPackFieldId)
        ? { storefront_pack_settings: foldPackSettings(drafts.tenant, saved.tenant) }
        : {}
    const mobilePatch = changedFieldIds(drafts, saved, 'mobile').length > 0
        ? { mobile_overrides: mergeMobileOverrides(saved.mobile as OverrideMap, drafts.mobile as OverrideMap) }
        : {}
    const jsonColumns = foldedJsonColumns(changed, drafts.tenant, saved.tenant)
    const patch = { ...columns, ...packPatch, ...jsonColumns, ...mobilePatch }
    return Object.keys(patch).length > 0 ? patch : null
}

/** The product_detail_settings columns to write, real columns only; null when unchanged. */
export function productPublishPatch(drafts: StudioDrafts, saved: SavedStores): Bag | null {
    const columns = Object.fromEntries(
        changedFieldIds(drafts, saved, 'product')
            .filter((fieldId) => VALID_DB_COLUMNS.has(fieldId))
            .map((fieldId) => [fieldId, drafts.product[fieldId]])
    )
    const mobilePatch = changedFieldIds(drafts, saved, 'mobileProduct').length > 0
        ? { mobile_overrides: mergeMobileOverrides(saved.mobileProduct as OverrideMap, drafts.mobileProduct as OverrideMap) }
        : {}
    const patch = { ...columns, ...mobilePatch }
    return Object.keys(patch).length > 0 ? patch : null
}
