/**
 * Card Template System
 * Provides different design templates for menu item cards
 * All templates respect tenant branding colors
 */

export type CardTemplate =
  | 'classic'      // Current design - image on top, content below
  | 'minimal'      // Clean, minimal design with subtle borders
  | 'modern'       // Overlapping elements, bold typography
  | 'elegant'      // Sophisticated with soft shadows
  | 'compact'      // Horizontal layout, info beside image
  | 'bold'         // High contrast, prominent CTA
  | 'glass'        // Glassmorphism with frosted glass effect
  | 'polaroid'     // Retro photo-style with thick frame
  | 'brutalist'    // Raw industrial with thick borders
  | 'magazine'     // Editorial full-bleed image overlay
  | 'zen'          // Ultra-minimal borderless design
  | 'neon'         // Dark card with neon glow accents

export interface CardTemplateDefinition {
  id: CardTemplate
  name: string
  description: string
  preview: string // Emoji representation
  features: string[]
}

/**
 * Available card templates with their metadata
 */
export const CARD_TEMPLATES: CardTemplateDefinition[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Traditional card layout with image on top',
    preview: '🎴',
    features: [
      'Image on top (4:3 ratio)',
      'Clear content separation',
      'Hover zoom effect',
      'Bottom-right add button'
    ]
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean and minimal design with subtle borders',
    preview: '⬜',
    features: [
      'Ultra-clean aesthetic',
      'Thin borders',
      'Subtle hover effects',
      'Centered content'
    ]
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Contemporary design with overlapping elements',
    preview: '✨',
    features: [
      'Floating add button',
      'Gradient overlays',
      'Bold typography',
      'Asymmetric layout'
    ]
  },
  {
    id: 'elegant',
    name: 'Elegant',
    description: 'Sophisticated design with soft shadows',
    preview: '💎',
    features: [
      'Soft shadow layers',
      'Refined spacing',
      'Elevated aesthetics',
      'Premium feel'
    ]
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Horizontal layout showing more items',
    preview: '📊',
    features: [
      'Horizontal orientation',
      'Space-efficient',
      'Quick scanning',
      'Mobile-optimized'
    ]
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'High contrast design with prominent CTA',
    preview: '🔥',
    features: [
      'High contrast',
      'Large add button',
      'Strong visuals',
      'Action-focused'
    ]
  },
  {
    id: 'glass',
    name: 'Glass',
    description: 'Glassmorphism with frosted translucent layers',
    preview: '🪟',
    features: [
      'Frosted glass effect',
      'Backdrop blur',
      'Translucent layers',
      'Soft glow hover'
    ]
  },
  {
    id: 'polaroid',
    name: 'Polaroid',
    description: 'Retro photo-style card with thick frame',
    preview: '📸',
    features: [
      'Photo frame style',
      'Tilt on hover',
      'Caption-style text',
      'Nostalgic feel'
    ]
  },
  {
    id: 'brutalist',
    name: 'Brutalist',
    description: 'Raw industrial design with bold geometry',
    preview: '🏗️',
    features: [
      'Thick borders',
      'Monospace pricing',
      'Offset shadow hover',
      'Stark contrast'
    ]
  },
  {
    id: 'magazine',
    name: 'Magazine',
    description: 'Editorial full-bleed image with text overlay',
    preview: '📰',
    features: [
      'Full-bleed image',
      'Tall portrait ratio',
      'Text over image',
      'Editorial feel'
    ]
  },
  {
    id: 'zen',
    name: 'Zen',
    description: 'Ultra-minimal borderless with airy spacing',
    preview: '🍃',
    features: [
      'No borders',
      'Generous whitespace',
      'Muted tones',
      'Appear-on-hover button'
    ]
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Dark card with neon glow border accents',
    preview: '💜',
    features: [
      'Dark background',
      'Neon glow border',
      'Vibrant accents',
      'Cyberpunk feel'
    ]
  }
]

/**
 * Get template definition by ID
 */
export function getTemplateById(id: CardTemplate): CardTemplateDefinition {
  return CARD_TEMPLATES.find(t => t.id === id) || CARD_TEMPLATES[0]
}

/**
 * Default template
 */
export const DEFAULT_CARD_TEMPLATE: CardTemplate = 'classic'

