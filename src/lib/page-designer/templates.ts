// Starting designs per page for the editor's template gallery. Every one is
// publishable as-is (tests/unit/page-designer/templates.test.ts): it holds
// every required block, visible on every device.

import type { HeroDesignV5 } from '@/lib/hero-builder/types'

import { createStandardDesign } from './standard-designs'
import { CHECKOUT_TEMPLATES } from './templates-checkout'
import { CHECKOUT_FAMILY_TEMPLATES } from './templates-checkout-families'
import { CHECKOUT_FORM_TEMPLATES } from './templates-checkout-forms'
import { CHECKOUT_STUDIO_TEMPLATES } from './templates-checkout-studio'
import { CHECKOUT_STYLE_TEMPLATES } from './templates-checkout-styles'
import { CONFIRMATION_TEMPLATES } from './templates-confirmation'
import { CONFIRMATION_FAMILY_TEMPLATES } from './templates-confirmation-families'
import type { TemplateFamily } from './templates-looks'
import { TRACKING_TEMPLATES } from './templates-tracking'
import { TRACKING_FAMILY_TEMPLATES } from './templates-tracking-families'
import type { PageId } from './types'

export interface PageTemplate {
  id: string
  name: string
  description: string
  category: PageTemplateCategory
  /** The matching look on the other two pages share this id (templates-looks.ts). */
  family?: TemplateFamily
  build: () => HeroDesignV5
}

export const PAGE_TEMPLATE_CATEGORIES = ['simple', 'delivery', 'store', 'bold', 'playful', 'branded', 'friendly'] as const
export type PageTemplateCategory = (typeof PAGE_TEMPLATE_CATEGORIES)[number]

/** The gallery's filter names. */
export const PAGE_TEMPLATE_CATEGORY_LABELS: Readonly<Record<PageTemplateCategory, string>> = {
  simple: 'Simple',
  delivery: 'Delivery & takeaway',
  store: 'In the store',
  bold: 'Bold',
  playful: 'Playful',
  branded: 'Branded',
  friendly: 'Friendly',
}

const standard = (page: PageId): PageTemplate => ({
  id: 'standard',
  name: page === 'checkout' ? 'Standard (Classic)' : 'Standard',
  description:
    page === 'checkout'
      ? 'Today’s Classic checkout as blocks — move them, re-word them and add your own text.'
      : 'Today’s page as blocks — move them, re-word them and add your own text.',
  category: 'simple',
  build: () => createStandardDesign(page),
})

/** "Standard" first, then each page's own templates (templates-<page>*.ts). */
export const PAGE_TEMPLATES: Readonly<Record<PageId, readonly PageTemplate[]>> = {
  tracking: [standard('tracking'), ...TRACKING_TEMPLATES, ...TRACKING_FAMILY_TEMPLATES],
  confirmation: [standard('confirmation'), ...CONFIRMATION_TEMPLATES, ...CONFIRMATION_FAMILY_TEMPLATES],
  checkout: [standard('checkout'), ...CHECKOUT_FORM_TEMPLATES, ...CHECKOUT_STUDIO_TEMPLATES, ...CHECKOUT_TEMPLATES, ...CHECKOUT_STYLE_TEMPLATES, ...CHECKOUT_FAMILY_TEMPLATES],
}
