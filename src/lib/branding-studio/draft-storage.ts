/**
 * Browser copy of the Studio's unpublished draft, so a reload or a closed tab
 * doesn't lose an owner's work. The stored text is untrusted on the way back:
 * only plain objects per store, and no prototype-polluting keys.
 */

import { EMPTY_DRAFTS, type StudioDrafts } from '@/lib/branding-studio/studio-drafts'

export interface DraftSnapshot {
    drafts: StudioDrafts
    savedAt: number
}

const STORES = ['tenant', 'product', 'mobile', 'mobileProduct', 'categories'] as const
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function draftStorageKey(tenantId: string): string {
    return `wn-branding-draft:${tenantId}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeCopy(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !UNSAFE_KEYS.has(key)))
}

export function serializeDraftSnapshot(drafts: StudioDrafts, savedAt: number): string {
    return JSON.stringify({ drafts, savedAt })
}

export function parseDraftSnapshot(text: string | null): DraftSnapshot | null {
    if (!text) return null
    let raw: unknown
    try {
        raw = JSON.parse(text)
    } catch {
        return null
    }
    if (!isPlainObject(raw) || !isPlainObject(raw.drafts) || typeof raw.savedAt !== 'number') return null
    const source = raw.drafts
    if (STORES.some((store) => source[store] !== undefined && !isPlainObject(source[store]))) return null
    const drafts = Object.fromEntries(
        STORES.map((store) => [store, isPlainObject(source[store]) ? safeCopy(source[store]) : EMPTY_DRAFTS[store]])
    ) as unknown as StudioDrafts
    return { drafts, savedAt: raw.savedAt }
}
