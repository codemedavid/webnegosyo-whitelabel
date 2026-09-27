'use client'

/**
 * Header Templates Index
 * Exports all header templates and a renderer that selects the right one.
 *
 * Unlike card templates, header templates are imported statically (not lazily):
 * the header is the single most above-the-fold element, so we avoid a loading
 * skeleton / layout shift at the very top of the page.
 */

import { memo } from 'react'
import { DEFAULT_HEADER_TEMPLATE, HEADER_TEMPLATE_IDS, type HeaderTemplate } from '@/lib/header-templates'
import { pickDesignId } from '@/lib/design-ids'
import type { HeaderEditSection, HeaderTemplateProps } from './header-parts'
import { ClassicHeader } from './classic-header'
import { CenteredHeader } from './centered-header'
import { MinimalHeader } from './minimal-header'
import { SplitHeader } from './split-header'
import { BannerHeader } from './banner-header'
import { StackedHeader } from './stacked-header'

export type { HeaderTemplateProps, HeaderEditSection } from './header-parts'

// Typed against the registry's id union: a registered header without a
// component here is a compile error.
const HEADER_COMPONENTS = {
  classic: ClassicHeader,
  centered: CenteredHeader,
  minimal: MinimalHeader,
  split: SplitHeader,
  banner: BannerHeader,
  stacked: StackedHeader,
} satisfies Record<HeaderTemplate, unknown>

/**
 * Get the header component for a template ID. Unknown ids fall back to Classic.
 */
export function getHeaderTemplateComponent(template: HeaderTemplate = DEFAULT_HEADER_TEMPLATE) {
  return HEADER_COMPONENTS[pickDesignId(template, HEADER_TEMPLATE_IDS, DEFAULT_HEADER_TEMPLATE)]
}

/**
 * Unified Menu Header Renderer.
 * Automatically selects the correct template based on the template prop.
 */
export const MenuHeaderRenderer = memo(function MenuHeaderRenderer({
  template = 'classic',
  ...props
}: HeaderTemplateProps & {
  template?: HeaderTemplate
  /** @deprecated Branding editing moved to the Branding Studio admin page. */
  isBrandAdmin?: boolean
  /** @deprecated Branding editing moved to the Branding Studio admin page. */
  onEditSection?: (section: HeaderEditSection) => void
}) {
  // The deprecated branding-editor props ride along in the spread but are
  // ignored by every header template. Editing lives in the Branding Studio.
  const HeaderComponent = getHeaderTemplateComponent(template)
  return <HeaderComponent {...props} />
})
