/**
 * Every Product Detail field the Studio offers must reach the diner's page:
 * through a --pd-* variable a component reads, or a resolved colour a
 * component uses by name. Before 2026-10-18, 19 of the 90 fields were saved
 * and never shown (add-on colours, the pairing pop-up, gradient, fonts,
 * animation…), so owners edited them and nothing happened.
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { getTenantBranding } from '@/lib/branding-utils'
import { getProductDetailFieldIds, PRODUCT_DETAIL_FIELD_INDEX } from '@/lib/product-detail-registry'
import { computeProductDetailStyles, getProductDetailThemeCSS, mergeSettingsWithBranding, type ProductDetailSettings } from '@/lib/product-detail-theme'

const SRC_DIR = join(__dirname, '..', '..', 'src')
// Only the diner's product page counts as a consumer — a cart or admin file
// reading the same variable name doesn't show the field to anyone.
const PRODUCT_PAGE_FILES = /^components\/customer\/(product-detail|modifier-groups-selector|addon-quantity-control|presell-date-picker|offers\/)/
const BRAND = getTenantBranding({})

function listSourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return listSourceFiles(path)
        return /\.(tsx?|css)$/.test(name) ? [path] : []
    })
}

const CONSUMER_SOURCE = listSourceFiles(SRC_DIR)
    .filter((file) => PRODUCT_PAGE_FILES.test(relative(SRC_DIR, file)))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')

function sentinelFor(fieldId: string): unknown {
    const field = PRODUCT_DETAIL_FIELD_INDEX[fieldId]
    if (field.type === 'color') return '#123457'
    if (field.type === 'toggle') return !field.default
    if (field.type === 'select') return field.options?.[0] === field.default ? field.options?.[1] : field.options?.[0]
    return 'sentinel-7'
}

/** Names (resolved-colour keys and CSS variables) that change when only this field changes. */
function namesCarrying(fieldId: string): string[] {
    const before = mergeSettingsWithBranding(null, BRAND) as unknown as Record<string, unknown>
    const after = mergeSettingsWithBranding({ [fieldId]: sentinelFor(fieldId) } as unknown as ProductDetailSettings, BRAND) as unknown as Record<string, unknown>
    const changedKeys = Object.keys(after).filter((key) => after[key] !== before[key])
    const cssBefore = getProductDetailThemeCSS(before as never) as Record<string, unknown>
    const cssAfter = getProductDetailThemeCSS(after as never) as Record<string, unknown>
    const changedVars = Object.keys(cssAfter).filter((name) => cssAfter[name] !== cssBefore[name])
    const stylesBefore = computeProductDetailStyles(before as never) as Record<string, unknown>
    const stylesAfter = computeProductDetailStyles(after as never) as Record<string, unknown>
    const changedStyles = Object.keys(stylesAfter)
        .filter((name) => JSON.stringify(stylesAfter[name]) !== JSON.stringify(stylesBefore[name]))
        .map((name) => `style:${name}`)
    return [...changedKeys, ...changedVars, ...changedStyles]
}

function isConsumed(name: string): boolean {
    if (name.startsWith('--')) return CONSUMER_SOURCE.includes(`var(${name}`)
    if (name.startsWith('style:')) return new RegExp(`dynamicStyles\\??\\.${name.slice(6)}\\b`).test(CONSUMER_SOURCE)
    return new RegExp(`\\b(themeColors|colors)\\.${name}\\b`).test(CONSUMER_SOURCE)
}

describe('Product Detail fields reach the page', () => {
    it('every field changes something a component shows', () => {
        const dead = getProductDetailFieldIds().filter((fieldId) => !namesCarrying(fieldId).some(isConsumed))

        expect(dead).toEqual([])
    })
})
