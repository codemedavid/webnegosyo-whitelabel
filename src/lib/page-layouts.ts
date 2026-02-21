/**
 * Page Layout System
 * Provides different page layout templates for menu pages
 * Controls the overall structure of the page (category navigation, grid arrangement)
 */

export type PageLayout =
    | 'default'     // Current design - hero + horizontal category tabs + grid
    | 'sidebar'     // Left sidebar with category icons + 2-column grid
    | 'magazine'    // Editorial-style with featured hero item + 2-col grid
    | 'grid-focus'  // Photo-forward, no hero, dense photo grid
    | 'list'        // Ultra-minimal single-column horizontal rows
    | 'mosaic'      // Pinterest-style masonry with varied card heights

export interface PageLayoutDefinition {
    id: PageLayout
    name: string
    description: string
    preview: string // Emoji representation
    features: string[]
}

/**
 * Available page layouts with their metadata
 */
export const PAGE_LAYOUTS: PageLayoutDefinition[] = [
    {
        id: 'default',
        name: 'Default',
        description: 'Classic layout with horizontal category tabs',
        preview: '📱',
        features: [
            'Hero section with title',
            'Horizontal category pills',
            'Full-width menu grid',
            'Promotion carousel'
        ]
    },
    {
        id: 'sidebar',
        name: 'Sidebar',
        description: 'Left sidebar navigation with compact grid',
        preview: '📊',
        features: [
            'Sticky sidebar navigation',
            'Category icons with labels',
            '2-column product grid',
            'Search bar at top'
        ]
    },
    {
        id: 'magazine',
        name: 'Magazine',
        description: 'Editorial style with large featured hero + grid',
        preview: '📰',
        features: [
            'Featured hero item',
            'Editorial typography',
            '2-column grid',
            'Generous whitespace'
        ]
    },
    {
        id: 'grid-focus',
        name: 'Grid Focus',
        description: 'Photo-forward dense grid, no hero section',
        preview: '🖼️',
        features: [
            'No hero section',
            'Dense 3-column grid',
            'Photo-first cards',
            'Slim category strip'
        ]
    },
    {
        id: 'list',
        name: 'List',
        description: 'Ultra-minimal single-column list rows',
        preview: '📋',
        features: [
            'Horizontal item rows',
            'Small thumbnails',
            'Ultra-clean layout',
            'Fast scanning'
        ]
    },
    {
        id: 'mosaic',
        name: 'Mosaic',
        description: 'Pinterest-style masonry with organic spacing',
        preview: '🧩',
        features: [
            'Masonry columns',
            'Varied card heights',
            'Discovery-oriented',
            'Artsy feel'
        ]
    }
]

/**
 * Get layout definition by ID
 */
export function getLayoutById(id: PageLayout): PageLayoutDefinition {
    return PAGE_LAYOUTS.find(l => l.id === id) || PAGE_LAYOUTS[0]
}

/**
 * Default page layout
 */
export const DEFAULT_PAGE_LAYOUT: PageLayout = 'default'
