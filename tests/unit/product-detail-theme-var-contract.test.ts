/**
 * Every `var(--pd-*)` a component reads must be a variable the product page
 * theme actually sets. A read of an unset variable silently falls back to the
 * page's inherited colour — that is how unselected options and add-on rows
 * went dark-on-dark on dark stores while the Studio showed the colours the
 * owner had picked (2026-10-18).
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { getProductDetailThemeCSS, mergeSettingsWithBranding } from '@/lib/product-detail-theme'
import { getTenantBranding } from '@/lib/branding-utils'

const SRC_DIR = join(__dirname, '..', '..', 'src')
const PD_VAR_READ = /var\(\s*(--pd-[a-z0-9-]+)/g

function listSourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return listSourceFiles(path)
        return /\.(tsx?|css)$/.test(name) ? [path] : []
    })
}

function definedThemeVariables(): Set<string> {
    const colors = mergeSettingsWithBranding(null, getTenantBranding({}))
    return new Set(Object.keys(getProductDetailThemeCSS(colors)))
}

describe('product detail theme variables', () => {
    it('only reads --pd-* variables that the theme defines', () => {
        const defined = definedThemeVariables()
        const undefinedReads = listSourceFiles(SRC_DIR).flatMap((file) => {
            const source = readFileSync(file, 'utf8')
            return [...source.matchAll(PD_VAR_READ)]
                .map((match) => match[1])
                .filter((name) => !defined.has(name))
                .map((name) => `${relative(SRC_DIR, file)}: ${name}`)
        })

        expect(undefinedReads).toEqual([])
    })
})
