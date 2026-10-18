'use client'

/**
 * Makes the store's own label wording available to every ordering-screen
 * component. Inside the Branding Studio preview the draft wording shows live.
 * Without a provider (or for a label the owner never set) components keep
 * their own wording.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useBrandingPreviewColumns } from '@/hooks/use-branding-preview'
import { readStorefrontLabels, type StorefrontLabelKey, type StorefrontLabels } from '@/lib/storefront-labels'

const StorefrontLabelsContext = createContext<StorefrontLabels>({})
const NO_TENANT: Record<string, unknown> = {}

export function StorefrontLabelsProvider({ tenant, children }: { tenant: object | null | undefined; children: ReactNode }) {
    const previewTenant = useBrandingPreviewColumns((tenant ?? NO_TENANT) as Record<string, unknown>)
    const labels = useMemo(() => readStorefrontLabels(previewTenant), [previewTenant])
    return <StorefrontLabelsContext.Provider value={labels}>{children}</StorefrontLabelsContext.Provider>
}

/** The owner's wording for `key`, else this component's own `fallback`. */
export function useStorefrontLabel(key: StorefrontLabelKey, fallback: string): string {
    return useContext(StorefrontLabelsContext)[key] ?? fallback
}

/** A label as text: the owner's wording, else `fallback`. For JSX text spots. */
export function StoreLabel({ name, fallback }: { name: StorefrontLabelKey; fallback: string }) {
    return <>{useStorefrontLabel(name, fallback)}</>
}
