'use client'

import { publishHeroDesignAction, unpublishHeroDesignAction } from '@/app/actions/hero-builder'
import { publishWelcomeDesignAction, unpublishWelcomeDesignAction } from '@/app/actions/welcome-builder'
import { SECTION_PRESETS, type SectionPreset } from '@/lib/hero-builder/section-presets'
import { HERO_TEMPLATE_CATEGORIES, HERO_TEMPLATES } from '@/lib/hero-builder/templates'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { WELCOME_SECTION_PRESETS } from '@/lib/welcome-builder/section-presets'
import { WELCOME_TEMPLATE_CATEGORIES, WELCOME_TEMPLATES } from '@/lib/welcome-builder/templates'

import type { LinkSurface } from './inspector/link-picker'
import { HERO_ADD_GROUPS, WELCOME_ADD_GROUP, type AddGroup } from './panels/add-panel'
import type { GalleryPreview, GalleryTemplate } from './template-gallery'

export interface PublishResult {
  success: boolean
  error?: string
}

export interface SurfaceTarget {
  tenantId: string
  tenantSlug: string
}

/**
 * Everything that differs between the builders that share this editor: what
 * the page is called, where it publishes, and which templates, blocks and
 * links it offers. The canvas, inspector, undo and drafts are shared.
 */
export interface BuilderSurface {
  linkSurface: LinkSurface
  title: string
  /** localStorage key prefix for the crash-safe draft. */
  draftPrefix: string
  templates: readonly GalleryTemplate[]
  templateCategories: readonly string[]
  templatePreview?: GalleryPreview
  addGroups: readonly AddGroup[]
  sectionPresets: readonly SectionPreset[]
  publish: (target: SurfaceTarget, design: HeroDesignV5) => Promise<PublishResult>
  unpublish: (target: SurfaceTarget) => Promise<PublishResult>
  publishedToast: string
  removedToast: string
  removeLabel: string
  /** Placeholder under the full preview, or null when the page stands alone. */
  previewFooter: string | null
}

export const HERO_SURFACE: BuilderSurface = {
  linkSurface: 'hero',
  title: 'Hero Builder',
  draftPrefix: 'hb-draft',
  templates: HERO_TEMPLATES,
  templateCategories: HERO_TEMPLATE_CATEGORIES,
  addGroups: HERO_ADD_GROUPS,
  sectionPresets: SECTION_PRESETS,
  publish: ({ tenantId, tenantSlug }, design) => publishHeroDesignAction(tenantId, tenantSlug, design),
  unpublish: ({ tenantId, tenantSlug }) => unpublishHeroDesignAction(tenantId, tenantSlug),
  publishedToast: 'Published — your storefront hero is live',
  removedToast: 'Removed from the storefront. Your design is kept here.',
  removeLabel: 'Remove from storefront',
  previewFooter: 'Your menu continues here',
}

/** The general groups without the slideshow, which the welcome group already offers. */
const WELCOME_GENERAL_GROUPS: readonly AddGroup[] = HERO_ADD_GROUPS.map((group) => ({
  ...group,
  tiles: group.tiles.filter((tile) => tile.kind !== 'slideshow'),
}))

export const WELCOME_SURFACE: BuilderSurface = {
  linkSurface: 'welcome',
  title: 'Welcome Builder',
  draftPrefix: 'wb-draft',
  templates: WELCOME_TEMPLATES,
  templateCategories: WELCOME_TEMPLATE_CATEGORIES,
  templatePreview: { width: 390, aspectClass: 'aspect-[9/16]', viewportHeight: 694, gridClass: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' },
  addGroups: [WELCOME_ADD_GROUP, ...WELCOME_GENERAL_GROUPS],
  sectionPresets: [...WELCOME_SECTION_PRESETS, ...SECTION_PRESETS],
  publish: ({ tenantId }, design) => publishWelcomeDesignAction(tenantId, design),
  unpublish: ({ tenantId }) => unpublishWelcomeDesignAction(tenantId),
  publishedToast: 'Published — customers now see your welcome page',
  removedToast: 'Welcome page turned off. Your design is kept here.',
  removeLabel: 'Turn off welcome page',
  previewFooter: null,
}
