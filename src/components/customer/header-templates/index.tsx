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
import type { HeaderTemplate } from '@/lib/header-templates'
import type { HeaderEditSection, HeaderTemplateProps } from './header-parts'
import { ClassicHeader } from './classic-header'
import { CenteredHeader } from './centered-header'
import { MinimalHeader } from './minimal-header'
import { SplitHeader } from './split-header'
import { BannerHeader } from './banner-header'
import { StackedHeader } from './stacked-header'

export type { HeaderTemplateProps, HeaderEditSection } from './header-parts'

/**
 * Get the appropriate header component based on the template ID.
 */
export function getHeaderTemplateComponent(template: HeaderTemplate = 'classic') {
  switch (template) {
    case 'centered':
      return CenteredHeader
    case 'minimal':
      return MinimalHeader
    case 'split':
      return SplitHeader
    case 'banner':
      return BannerHeader
    case 'stacked':
      return StackedHeader
    case 'classic':
    default:
      return ClassicHeader
  }
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
