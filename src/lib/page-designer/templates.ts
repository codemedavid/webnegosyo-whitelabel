// Starting designs per page for the editor's template gallery. Every one is
// publishable as-is (tests/unit/page-designer/templates.test.ts): it holds
// every required block, visible on every device.

import type { HeroDesignV5 } from '@/lib/hero-builder/types'

import { createStandardDesign } from './standard-designs'
import { CHECKOUT_TEMPLATES } from './templates-checkout'
import { CONFIRMATION_TEMPLATES } from './templates-confirmation'
import { TRACKING_TEMPLATES } from './templates-tracking'
import type { PageId } from './types'

export interface PageTemplate {
  id: string
  name: string
  description: string
  category: string
  build: () => HeroDesignV5
}

export const PAGE_TEMPLATE_CATEGORIES = ['simple', 'branded', 'friendly'] as const

const standard = (page: PageId): PageTemplate => ({
  id: 'standard',
  name: 'Standard',
  description: 'Today’s page as blocks — move them, re-word them and add your own text.',
  category: 'simple',
  build: () => createStandardDesign(page),
})

/** "Standard" first, then each page's own templates (templates-<page>.ts). */
export const PAGE_TEMPLATES: Readonly<Record<PageId, readonly PageTemplate[]>> = {
  tracking: [standard('tracking'), ...TRACKING_TEMPLATES],
  confirmation: [standard('confirmation'), ...CONFIRMATION_TEMPLATES],
  checkout: [standard('checkout'), ...CHECKOUT_TEMPLATES],
}
