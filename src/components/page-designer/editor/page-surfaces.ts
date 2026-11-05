'use client'

import { publishPageDesignAction, unpublishPageDesignAction } from '@/app/actions/page-designer'
import { SECTION_PRESETS } from '@/lib/hero-builder/section-presets'
import type { Widget } from '@/lib/hero-builder/types'
import { PAGE_META } from '@/lib/page-designer/pages'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'
import { PAGE_TEMPLATE_CATEGORIES, PAGE_TEMPLATE_CATEGORY_LABELS, PAGE_TEMPLATES } from '@/lib/page-designer/templates'
import type { PageLookInput } from '@/lib/page-designer/look'
import type { PageId } from '@/lib/page-designer/types'
import type { PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { HERO_ADD_GROUPS, type AddGroup } from '@/components/hero-builder/editor/panels/add-panel'
import type { BuilderSurface } from '@/components/hero-builder/editor/surface'

import { FAMILY_BANNERS, rememberTemplatePick } from './family-banner'

const PUBLISHED: Record<PageId, string> = {
  tracking: 'Published — customers now see your tracking page',
  confirmation: 'Published — customers now see your thank-you page',
  checkout: 'Published — customers now check out on your page',
}

/** The builder's free elements, minus what this page never offers (embed, …). */
function addGroupsFor(page: PageId): AddGroup[] {
  const allowed = new Set(PAGE_META[page].freeKinds)
  return HERO_ADD_GROUPS.map((g) => ({ ...g, tiles: g.tiles.filter((t) => allowed.has(t.kind)) })).filter((g) => g.tiles.length)
}

/** Ready-made sections whose every element this page offers. */
function presetsFor(page: PageId) {
  const allowed = new Set(PAGE_META[page].freeKinds)
  return SECTION_PRESETS.filter((preset) =>
    preset.build().columns.every((c) => c.widgets.every((w: Widget) => allowed.has(w.kind))),
  )
}

/** The page's unsaved Look, read at publish time; `onSaved` runs once it is stored. */
export interface PendingLook {
  input: PageLookInput | undefined
  /** Called with exactly the changes that were stored. */
  onSaved: (sent: PageLookInput['changes']) => void
}

export function buildPageSurface(
  page: PageId,
  runtime: (state: string | null) => PageRuntime,
  pendingLook: () => PendingLook | null = () => null,
): BuilderSurface {
  return {
    linkSurface: 'hero',
    title: 'Page Designer',
    draftPrefix: `pd-draft-${page}`,
    templates: PAGE_TEMPLATES[page],
    templateCategories: PAGE_TEMPLATE_CATEGORIES,
    templateCategoryLabels: PAGE_TEMPLATE_CATEGORY_LABELS,
    // A family look picked here is offered on the other two pages.
    onTemplatePicked: (templateId, { tenantId }) => rememberTemplatePick(tenantId, page, templateId),
    Banner: FAMILY_BANNERS[page],
    templatePreview: { width: 390, aspectClass: 'aspect-[9/16]', viewportHeight: 694, gridClass: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' },
    addGroups: addGroupsFor(page),
    sectionPresets: presetsFor(page),
    publish: async ({ tenantId }, design) => {
      const look = pendingLook()
      const sent = look?.input
      const result = await publishPageDesignAction(tenantId, page, design, sent)
      if (result.success && sent) look?.onSaved(sent.changes)
      return result
    },
    unpublish: ({ tenantId }) => unpublishPageDesignAction(tenantId, page),
    publishedToast: PUBLISHED[page],
    removedToast: 'Back to the standard page. Your design is kept here.',
    removeLabel: 'Use the standard page',
    previewFooter: null,
    page: { id: page, runtime, standardDesign: () => createStandardDesign(page) },
  }
}
