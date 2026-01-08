/**
 * Page Layout System
 * Provides different page layout templates for menu pages
 * Controls the overall structure of the page (category navigation, grid arrangement)
 */

export type PageLayout =
    | 'default'     // Current design - hero + horizontal category tabs + grid
    | 'sidebar'     // Left sidebar with category icons + 2-column grid

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
