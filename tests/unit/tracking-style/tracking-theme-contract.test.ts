/**
 * The order page and loyalty card paint ONLY from variables the theme defines.
 * A `var(--trk-…)` the theme never sets renders transparent (the product
 * page's chips once did exactly that), and a hard-coded colour ignores the
 * owner's settings in the Branding Studio.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { TRACKING_THEME_VARIABLES } from '@/components/customer/order-tracking/tracking-theme'
import { TRACKING_CHOICES, TRACKING_TOGGLES } from '@/lib/tracking-style/keys'

const SRC = join(__dirname, '../../../src')

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return sourceFiles(path)
        return /\.(ts|tsx)$/.test(name) ? [path] : []
    })
}

/** Files that render the order page or the loyalty card. */
const THEMED_FILES = [
    ...sourceFiles(join(SRC, 'components/customer/order-tracking')),
    join(SRC, 'components/customer/loyalty-stamp-card.tsx'),
    join(SRC, 'components/customer/loyalty-progress-panel.tsx'),
    join(SRC, 'components/customer/add-to-wallet-buttons.tsx'),
    join(SRC, 'components/customer/pickup-qr-card.tsx'),
    join(SRC, 'app/[tenant]/order/[orderId]/order-tracking-client.tsx'),
    join(SRC, 'app/[tenant]/order/[orderId]/order-tracking-fallback.tsx'),
]

const DEFINED = new Set(TRACKING_THEME_VARIABLES)

describe('tracking theme contract', () => {
    it('defines every --trk variable the storefront reads', () => {
        const read = sourceFiles(SRC).flatMap((path) =>
            [...readFileSync(path, 'utf8').matchAll(/var\((--trk-[a-z0-9-]+)/g)].map((match) => `${path.replace(SRC, 'src')}: ${match[1]}`)
        )
        const undefinedReads = read.filter((entry) => !DEFINED.has(entry.split(': ')[1]))

        expect(undefinedReads).toEqual([])
    })

    it('keeps hard-coded colours out of the order page and loyalty card', () => {
        // White stays only where it must: the QR code's plate (scanners need it).
        const offenders = THEMED_FILES.flatMap((path) => {
            const source = readFileSync(path, 'utf8').replace(/mx-auto w-fit bg-white p-4/g, '')
            const hits = source.match(/#[0-9a-fA-F]{3,6}\b|\b(?:bg|text|border|from|to)-(?:white|black|gray|neutral|zinc|slate|stone|red|green|amber|emerald|yellow)\b(?:-\d+)?(?:\/\d+)?/g) ?? []
            return hits.map((hit) => `${path.replace(SRC, 'src')}: ${hit}`)
        })

        expect(offenders).toEqual([])
    })

    it('reads every choice the theme cannot paint in a component', () => {
        // Colours, corners, banner/band styles and stamp shapes are CSS variables
        // (pinned by tracking-theme.test.ts); these change what React renders.
        const cssChoices = new Set(['hero_style', 'corners', 'band_style', 'stamp_shape', 'show_glow'])
        const reactChoices = [...Object.keys(TRACKING_CHOICES), ...Object.keys(TRACKING_TOGGLES)].filter((key) => !cssChoices.has(key))
        const sources = THEMED_FILES.map((path) => readFileSync(path, 'utf8')).join('\n')

        expect(reactChoices.filter((key) => !new RegExp(`\\b${key}\\b`).test(sources))).toEqual([])
    })
})
