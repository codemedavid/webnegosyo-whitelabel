'use client'

/**
 * The Studio's editing state: one undoable draft over every store, the
 * locally-published overlays that keep the panel accurate after Publish, the
 * change list, and a browser copy of unpublished work (offered back after a
 * reload). The rules live in `@/lib/branding-studio/studio-drafts`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    clearValue,
    clearValues,
    commit,
    createHistory,
    EMPTY_DRAFTS,
    listChanges,
    redo as redoHistory,
    revertChange,
    setCategories as setCategoryDraft,
    setValue,
    setValues,
    undo as undoHistory,
    type ChangeStore,
    type SavedStores,
    type StudioDrafts,
    type StudioHistory,
    type ValueStore,
} from '@/lib/branding-studio/studio-drafts'
import { draftStorageKey, parseDraftSnapshot, serializeDraftSnapshot, type DraftSnapshot } from '@/lib/branding-studio/draft-storage'
import { flattenPackSettings, foldPackSettings, isPackFieldId } from '@/lib/storefront-pack-studio'
import type { OverrideMap } from '@/lib/mobile-overrides'
import type { CategoryStudioDraft } from '@/lib/category-studio'
import type { Category, Tenant } from '@/types/database'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'

type Bag = Record<string, unknown>

/** Wait this long after the last edit before writing the browser copy. */
const AUTOSAVE_DELAY_MS = 800

export interface PublishedParts {
    tenant?: boolean
    product?: boolean
    categories?: Category[]
}

interface UseStudioDraftsOptions {
    tenant: Tenant
    productSettings: Partial<ProductDetailSettings> | null | undefined
    categories: Category[]
}

function readSnapshot(key: string): DraftSnapshot | null {
    try {
        return parseDraftSnapshot(window.localStorage.getItem(key))
    } catch {
        return null
    }
}

function writeSnapshot(key: string, drafts: StudioDrafts | null): void {
    try {
        if (drafts) window.localStorage.setItem(key, serializeDraftSnapshot(drafts, Date.now()))
        else window.localStorage.removeItem(key)
    } catch {
        // Storage full or blocked (private mode): the draft still lives in memory.
    }
}

export function useStudioDrafts({ tenant, productSettings, categories }: UseStudioDraftsOptions) {
    const [history, setHistory] = useState<StudioHistory>(() => createHistory())
    // Locally-published values layered over the server snapshots so the editor
    // stays accurate after Publish without waiting for a router refresh.
    const [publishedValues, setPublishedValues] = useState<Bag>({})
    const [publishedProductValues, setPublishedProductValues] = useState<Bag>({})
    const [publishedMobile, setPublishedMobile] = useState<OverrideMap | null>(null)
    const [publishedMobileProduct, setPublishedMobileProduct] = useState<OverrideMap | null>(null)
    const [publishedCategories, setPublishedCategories] = useState<Category[] | null>(null)
    const [pendingRestore, setPendingRestore] = useState<DraftSnapshot | null>(null)

    const tenantBag = tenant as unknown as Bag
    const storageKey = draftStorageKey(tenant.id)

    const savedTenant = useMemo(() => {
        const merged = { ...tenantBag, ...publishedValues }
        // Storefront pack settings live in one jsonb column; the Studio edits
        // them as virtual fields, so expose the saved ones under those ids too.
        return { ...merged, ...flattenPackSettings(merged) }
    }, [tenantBag, publishedValues])
    const savedProduct = useMemo<Bag>(
        () => ({ ...(productSettings ?? {}), ...publishedProductValues }),
        [productSettings, publishedProductValues]
    )
    const savedMobile = useMemo<OverrideMap>(
        () => publishedMobile ?? (tenantBag.mobile_overrides as OverrideMap) ?? {},
        [publishedMobile, tenantBag]
    )
    const savedMobileProduct = useMemo<OverrideMap>(
        () => publishedMobileProduct ?? ((productSettings?.mobile_overrides as OverrideMap) ?? {}),
        [publishedMobileProduct, productSettings]
    )
    const savedCategories = publishedCategories ?? categories

    const saved = useMemo<SavedStores>(
        () => ({ tenant: savedTenant, product: savedProduct, mobile: savedMobile, mobileProduct: savedMobileProduct }),
        [savedTenant, savedProduct, savedMobile, savedMobileProduct]
    )

    const drafts = history.present
    const changes = useMemo(() => listChanges(drafts, saved), [drafts, saved])

    // Offer back what was left unpublished last time (once, on open).
    useEffect(() => {
        const snapshot = readSnapshot(storageKey)
        if (snapshot && listChanges(snapshot.drafts, saved).length > 0) setPendingRestore(snapshot)
        // Only on open: later saves must not re-prompt.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey])

    // Keep the browser copy current; nothing to keep means nothing stored.
    useEffect(() => {
        if (pendingRestore) return
        const timer = window.setTimeout(
            () => writeSnapshot(storageKey, changes.length > 0 ? drafts : null),
            AUTOSAVE_DELAY_MS
        )
        return () => window.clearTimeout(timer)
    }, [drafts, changes.length, storageKey, pendingRestore])

    const edit = useCallback((change: (current: StudioDrafts) => StudioDrafts, key: string | null = null) => {
        setHistory((current) => commit(current, change(current.present), { key, at: Date.now() }))
    }, [])

    const setField = useCallback((store: ValueStore, fieldId: string, value: unknown) => {
        edit((current) => setValue(current, store, fieldId, value), `${store}:${fieldId}`)
    }, [edit])

    const clearField = useCallback((store: ValueStore, fieldId: string) => {
        edit((current) => clearValue(current, store, fieldId, saved))
    }, [edit, saved])

    const clearFields = useCallback((store: ValueStore, fieldIds: readonly string[]) => {
        edit((current) => clearValues(current, store, fieldIds, saved))
    }, [edit, saved])

    const applyValues = useCallback((store: ValueStore, values: Bag) => {
        edit((current) => setValues(current, store, values))
    }, [edit])

    const setCategories = useCallback((categoryDraft: CategoryStudioDraft) => {
        edit((current) => setCategoryDraft(current, categoryDraft), 'categories')
    }, [edit])

    const revert = useCallback((store: ChangeStore, fieldId: string) => {
        edit((current) => revertChange(current, store, fieldId))
    }, [edit])

    const undo = useCallback(() => setHistory(undoHistory), [])
    const redo = useCallback(() => setHistory(redoHistory), [])

    const discardAll = useCallback(() => {
        edit(() => EMPTY_DRAFTS)
    }, [edit])

    const restore = useCallback(() => {
        if (pendingRestore) {
            // Categories deleted since the copy was kept drop out of its layout edits.
            const known = new Set(savedCategories.map((category) => category.id))
            const kept = pendingRestore.drafts.categories
            const categoriesDraft: CategoryStudioDraft = {
                ...(kept.order ? { order: kept.order.filter((id) => known.has(id)) } : {}),
                ...(kept.overrides
                    ? { overrides: Object.fromEntries(Object.entries(kept.overrides).filter(([id]) => known.has(id))) }
                    : {}),
            }
            const restored = { ...pendingRestore.drafts, categories: categoriesDraft }
            setHistory((current) => commit(current, restored, { key: null, at: Date.now() }))
        }
        setPendingRestore(null)
    }, [pendingRestore, savedCategories])

    const dismissRestore = useCallback(() => {
        writeSnapshot(storageKey, null)
        setPendingRestore(null)
    }, [storageKey])

    /**
     * Fold what was published into the saved overlays and drop it from the
     * draft. `sent` is the draft as it was when Publish started: edits made
     * while the publish was in flight stay in the draft, and a store that
     * failed keeps all of its edits for a retry. Undo history starts over —
     * the published values are the new baseline.
     */
    const markPublished = useCallback((
        parts: PublishedParts,
        sent: StudioDrafts,
        nextMobile: OverrideMap | null,
        nextMobileProduct: OverrideMap | null,
    ) => {
        if (parts.tenant) {
            // Pack settings are virtual fields over one jsonb column: overlay the
            // folded column too, or the stale column would win until a refresh.
            const packColumn = Object.keys(sent.tenant).some(isPackFieldId)
                ? { storefront_pack_settings: foldPackSettings(sent.tenant, savedTenant) }
                : {}
            setPublishedValues((prev) => ({ ...prev, ...sent.tenant, ...packColumn }))
            if (nextMobile) setPublishedMobile(nextMobile)
        }
        if (parts.product) {
            setPublishedProductValues((prev) => ({ ...prev, ...sent.product }))
            if (nextMobileProduct) setPublishedMobileProduct(nextMobileProduct)
        }
        if (parts.categories) setPublishedCategories(parts.categories)
        const unsent = (store: ValueStore, didPublish: boolean | undefined, current: StudioDrafts): Bag =>
            didPublish
                ? Object.fromEntries(Object.entries(current[store]).filter(([key, value]) => sent[store][key] !== value))
                : current[store]
        setHistory((current) => createHistory({
            tenant: unsent('tenant', parts.tenant, current.present),
            mobile: unsent('mobile', parts.tenant, current.present),
            product: unsent('product', parts.product, current.present),
            mobileProduct: unsent('mobileProduct', parts.product, current.present),
            categories: parts.categories && current.present.categories === sent.categories ? {} : current.present.categories,
        }))
    }, [savedTenant])

    return {
        drafts,
        saved,
        savedTenant,
        savedProduct,
        savedMobile,
        savedMobileProduct,
        savedCategories,
        changes,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
        pendingRestore,
        setField,
        clearField,
        clearFields,
        applyValues,
        setCategories,
        revert,
        undo,
        redo,
        discardAll,
        restore,
        dismissRestore,
        markPublished,
    }
}
