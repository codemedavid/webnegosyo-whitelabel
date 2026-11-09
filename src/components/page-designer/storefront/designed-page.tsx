'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'

import type { InStoreLinkTarget } from '@/lib/hero-builder/link-target'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { HeroBuilderRenderer } from '@/components/hero-builder/renderer/hero-builder-renderer'
import { HeroLinkProvider } from '@/components/hero-builder/renderer/link-context'
import { PageRuntimeProvider, type PageRuntime } from '@/components/hero-builder/renderer/page-runtime'

interface DesignedPageProps {
  /** Already prepared for the page (resolvePageDesign). */
  design: HeroDesignV5
  runtime: PageRuntime
  tenantSlug: string
  className?: string
}

/**
 * A published Page Designer page on the storefront. There is no menu on
 * checkout or tracking, so menu / category / product links open the menu
 * page; section links scroll as usual.
 */
export function DesignedPage({ design, runtime, tenantSlug, className }: DesignedPageProps) {
  const router = useRouter()
  const onLink = useCallback(
    (target: InStoreLinkTarget): boolean => {
      if (target.type === 'anchor') return false
      if (target.type === 'product') router.push(`/${tenantSlug}/menu/item/${target.itemId}`)
      else router.push(`/${tenantSlug}/menu`)
      return true
    },
    [router, tenantSlug],
  )
  return (
    <PageRuntimeProvider value={runtime}>
      <HeroLinkProvider value={onLink}>
        <HeroBuilderRenderer design={design} className={className} />
      </HeroLinkProvider>
    </PageRuntimeProvider>
  )
}
