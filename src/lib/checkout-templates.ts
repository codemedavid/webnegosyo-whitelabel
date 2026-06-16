/**
 * Checkout Template System
 * Provides selectable design presets for the customer checkout page.
 * All templates share the same checkout logic (via the useCheckout hook)
 * and respect tenant branding colors — only the presentation differs.
 */

export type CheckoutTemplate =
  | 'classic'   // Current design — single column, stacked white cards, orange accents
  | 'modern'    // Two-column: form on the left, sticky live order summary on the right
  | 'wizard'    // Multi-step: Order → Details → Payment → Review, one focused screen at a time
  | 'minimal'   // Single centered column, generous whitespace, big type, collapsible sections
  | 'express'   // Mobile-first condensed sheet with a sticky pay bar

export interface CheckoutTemplateDefinition {
  id: CheckoutTemplate
  name: string
  description: string
  preview: string // Emoji representation
  features: string[]
}

/**
 * Available checkout templates with their metadata.
 * Source of truth for the admin design picker.
 */
export const CHECKOUT_TEMPLATES: CheckoutTemplateDefinition[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Your current checkout — single column with stacked cards',
    preview: '🧾',
    features: [
      'Single column flow',
      'Stacked white cards',
      'Familiar & proven',
      'Works everywhere',
    ],
  },
  {
    id: 'modern',
    name: 'Modern Two-Column',
    description: 'Form on the left, sticky live order summary on the right',
    preview: '🛍️',
    features: [
      'Sticky order summary',
      'Spacious two-column',
      'Shopify-style',
      'Clear hierarchy',
    ],
  },
  {
    id: 'wizard',
    name: 'Step-by-Step',
    description: 'Guided multi-step flow — one focused screen at a time',
    preview: '🧭',
    features: [
      'Progress stepper',
      'Less overwhelm',
      'Shop Pay-style',
      'Great on mobile',
    ],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean centered column with generous whitespace',
    preview: '⚪',
    features: [
      'Distraction-free',
      'Big typography',
      'Collapsible sections',
      'Premium feel',
    ],
  },
  {
    id: 'express',
    name: 'Express',
    description: 'Condensed, thumb-friendly sheet with a sticky pay bar',
    preview: '⚡',
    features: [
      'Sticky pay bar',
      'Compact sections',
      'Fast mobile ordering',
      'Food-app style',
    ],
  },
]

/**
 * Get a checkout template definition by ID (falls back to the first/classic).
 */
export function getCheckoutTemplateById(id: CheckoutTemplate): CheckoutTemplateDefinition {
  return CHECKOUT_TEMPLATES.find((t) => t.id === id) || CHECKOUT_TEMPLATES[0]
}

/**
 * Default checkout template.
 */
export const DEFAULT_CHECKOUT_TEMPLATE: CheckoutTemplate = 'classic'
