// The "standard" design per page: today's layout as a design — the editor's
// starting point and "Reset to standard". Not what an unpublished store
// renders: until a design is published, each page renders its existing code
// path untouched.

import { DESIGN_VERSION } from '@/lib/hero-builder/constants'
import { DEFAULT_THEME, createSection } from '@/lib/hero-builder/defaults'
import type { HeroDesignV5, Section } from '@/lib/hero-builder/types'

import { blockDef, STANDARD_ORDER } from './blocks'
import { createPageBlock } from './design-blocks'
import type { PageBlockDef, PageId } from './types'

/** Narrow like the real pages (tracking/thank-you max-w-lg, checkout a bit wider). */
const CONTENT_WIDTH: Record<PageId, number> = { tracking: 560, confirmation: 640, checkout: 720 }

export function standardSection(page: PageId, ids: readonly string[] = STANDARD_ORDER[page], label = 'Page'): Section {
  const base = createSection([100], label)
  const widgets = ids
    .map((id) => blockDef(id))
    .filter((def): def is PageBlockDef => !!def && def.page === page)
    .map(createPageBlock)
  return {
    ...base,
    style: { ...base.style, padding: { top: 24, right: 16, bottom: 40, left: 16 }, contentWidth: CONTENT_WIDTH[page], gap: 16 },
    tablet: { padding: { top: 24, right: 16, bottom: 40, left: 16 } },
    mobile: { stack: true, gap: 16, padding: { top: 16, right: 12, bottom: 32, left: 12 } },
    columns: [{ ...base.columns[0], style: { width: 100, gap: 16 }, widgets }],
  }
}

export function createStandardDesign(page: PageId): HeroDesignV5 {
  return { version: DESIGN_VERSION, theme: { ...DEFAULT_THEME, colors: {} }, sections: [standardSection(page)] }
}
