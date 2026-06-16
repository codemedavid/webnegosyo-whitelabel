/**
 * Cart Template System
 * Provides selectable design presets for the customer cart page.
 * All templates share the same cart logic (via the useCartView hook)
 * and respect tenant branding colors — only the presentation differs.
 */

export type CartTemplate =
  | 'classic'   // Current design — items list + sticky summary sidebar, orange accents
  | 'modern'    // Refined two-column with a prominent sticky summary card
  | 'wizard'    // Receipt-style centered single column
  | 'minimal'   // Airy single column, big type, thin dividers
  | 'express'   // Mobile-first compact rows with a sticky checkout bar

export interface CartTemplateDefinition {
  id: CartTemplate
  name: string
  description: string
  preview: string // Emoji representation
  features: string[]
}

/**
 * Available cart templates with their metadata.
 * Source of truth for the admin design picker.
 */
export const CART_TEMPLATES: CartTemplateDefinition[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Your current cart — items list with a sticky summary sidebar',
    preview: '🛒',
    features: [
      'Two-column layout',
      'Sticky order summary',
      'Familiar & proven',
      'Works everywhere',
    ],
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Refined two-column with a prominent sticky summary card',
    preview: '🛍️',
    features: [
      'Elevated summary card',
      'Spacious rows',
      'Shopify-style',
      'Clear totals',
    ],
  },
  {
    id: 'wizard',
    name: 'Receipt',
    description: 'Centered receipt-style single column',
    preview: '🧾',
    features: [
      'Receipt aesthetic',
      'Centered column',
      'Itemized clarity',
      'Great on mobile',
    ],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Airy single column with big type and thin dividers',
    preview: '⚪',
    features: [
      'Distraction-free',
      'Big typography',
      'Thin dividers',
      'Premium feel',
    ],
  },
  {
    id: 'express',
    name: 'Express',
    description: 'Compact rows with a sticky checkout bar',
    preview: '⚡',
    features: [
      'Sticky checkout bar',
      'Compact rows',
      'Fast mobile flow',
      'Food-app style',
    ],
  },
]

/**
 * Get a cart template definition by ID (falls back to the first/classic).
 */
export function getCartTemplateById(id: CartTemplate): CartTemplateDefinition {
  return CART_TEMPLATES.find((t) => t.id === id) || CART_TEMPLATES[0]
}

/**
 * Default cart template.
 */
export const DEFAULT_CART_TEMPLATE: CartTemplate = 'classic'
