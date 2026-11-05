'use client'

import { useCallback, useMemo, type CSSProperties } from 'react'

import { EMPTY_LINK_CATALOG } from '@/lib/hero-builder/link-catalog'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import type { ConfirmationRedirectSetting } from '@/lib/page-designer/page-mode'
import type { PageId } from '@/lib/page-designer/types'
import { HeroBuilderEditor } from '@/components/hero-builder/editor/hero-builder-editor'
import type { PageRuntime } from '@/components/hero-builder/renderer/page-runtime'

import { SAMPLE_BLOCKS, sampleTokens } from '../samples'
import { buildPageSurface } from './page-surfaces'
import { PageTabs } from './page-tabs'
import { RedirectSetting } from './redirect-setting'

export interface PageDesignerEditorProps {
  tenantId: string
  tenantSlug: string
  page: PageId
  storeName: string
  /** The store's Branding Studio wording (blank text slots fall back to it). */
  labels: Readonly<Record<string, string>>
  initialDesign: HeroDesignV5 | null
  initialIsLive: boolean
  /** Brand + the page's own theme variables, so blocks paint like the live page. */
  brandStyle: CSSProperties
  redirect: ConfirmationRedirectSetting
}

const LIVE_PATH: Record<PageId, string> = { tracking: 'menu', confirmation: 'menu', checkout: 'checkout' }

/** The Hero Builder editor running as the Page Designer for one page. */
export function PageDesignerEditor({ tenantId, tenantSlug, page, storeName, labels, redirect, ...editor }: PageDesignerEditorProps) {
  const runtime = useCallback(
    (state: string | null): PageRuntime => ({
      page,
      state,
      tokens: sampleTokens(page, storeName),
      labels,
      blocks: SAMPLE_BLOCKS[page],
    }),
    [page, storeName, labels],
  )
  const surface = useMemo(() => buildPageSurface(page, runtime), [page, runtime])
  return (
    <HeroBuilderEditor
      // Each page keeps its own undo history and draft.
      key={page}
      {...editor}
      tenantId={tenantId}
      tenantSlug={tenantSlug}
      linkCatalog={EMPTY_LINK_CATALOG}
      surface={surface}
      liveHref={`/${tenantSlug}/${LIVE_PATH[page]}`}
      toolbarSlot={
        <>
          <PageTabs tenantSlug={tenantSlug} current={page} />
          {page === 'confirmation' && <RedirectSetting tenantId={tenantId} initial={redirect} />}
        </>
      }
    />
  )
}
