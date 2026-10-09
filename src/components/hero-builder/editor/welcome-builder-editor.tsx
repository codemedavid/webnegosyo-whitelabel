'use client'

import { useMemo, type CSSProperties } from 'react'

import { EMPTY_LINK_CATALOG } from '@/lib/hero-builder/link-catalog'
import type { EntryMode, HeroDesignV5 } from '@/lib/hero-builder/types'
import { SAMPLE_WELCOME_RUNTIME, WelcomeRuntimeProvider, type WelcomeRuntime } from '@/components/hero-builder/renderer/welcome-runtime'

import { HeroBuilderEditor } from './hero-builder-editor'
import { WELCOME_SURFACE } from './surface'

interface WelcomeBuilderEditorProps {
  tenantId: string
  tenantSlug: string
  storeName: string
  logoUrl: string | null
  /** The order types customers will be offered; empty shows the sample set. */
  modes: readonly EntryMode[]
  initialDesign: HeroDesignV5 | null
  initialIsLive: boolean
  brandStyle: CSSProperties
}

/**
 * The Hero Builder editor running as the Welcome Builder. The canvas, the
 * preview and the template thumbnails all render with the store's real name,
 * logo and order types; the order buttons are inert while editing.
 */
export function WelcomeBuilderEditor({ storeName, logoUrl, modes, ...editor }: WelcomeBuilderEditorProps) {
  const runtime = useMemo<WelcomeRuntime>(
    () => ({
      ...SAMPLE_WELCOME_RUNTIME,
      storeName: storeName || SAMPLE_WELCOME_RUNTIME.storeName,
      logoUrl,
      modes: modes.length ? modes : SAMPLE_WELCOME_RUNTIME.modes,
    }),
    [storeName, logoUrl, modes],
  )
  return (
    <WelcomeRuntimeProvider value={runtime}>
      <HeroBuilderEditor
        {...editor}
        linkCatalog={EMPTY_LINK_CATALOG}
        surface={WELCOME_SURFACE}
        liveHref={`/${editor.tenantSlug}/menu`}
      />
    </WelcomeRuntimeProvider>
  )
}
