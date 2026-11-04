// Starting designs per page for the editor's template gallery. Every one is
// publishable as-is (tests/unit/page-designer/templates.test.ts): it holds
// every required block, visible on every device.

import type { HeroDesignV5 } from '@/lib/hero-builder/types'

import { createStandardDesign } from './standard-designs'
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

/** Page-specific templates are appended by each page's templates file. */
export const PAGE_TEMPLATES: Readonly<Record<PageId, readonly PageTemplate[]>> = {
  tracking: [standard('tracking')],
  confirmation: [standard('confirmation')],
  checkout: [standard('checkout')],
}
