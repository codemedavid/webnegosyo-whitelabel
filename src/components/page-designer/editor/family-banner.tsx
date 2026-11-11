'use client'

/**
 * "Use this style on all three pages": remembers the family look an owner
 * picked on one page (per store, in localStorage) and, on each OTHER page
 * whose design is still as it opened, offers the matching template once.
 * Taking it goes through api.replaceDesign, so undo brings the old design back.
 */

import { useEffect, useState, type ComponentType } from 'react'
import { Sparkles, X } from 'lucide-react'

import {
  familyOffer,
  familyOfferMessage,
  familyStorageKey,
  nextFamilyPick,
  parseFamilyPick,
  withPageDone,
  type FamilyOffer,
  type FamilyPick,
} from '@/lib/page-designer/templates-families'
import type { PageId } from '@/lib/page-designer/types'
import type { SurfaceBannerProps } from '@/components/hero-builder/editor/surface'

function readPick(tenantId: string): FamilyPick | null {
  try {
    const raw = window.localStorage.getItem(familyStorageKey(tenantId))
    return raw ? parseFamilyPick(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writePick(tenantId: string, pick: FamilyPick | null): void {
  try {
    const key = familyStorageKey(tenantId)
    if (pick) window.localStorage.setItem(key, JSON.stringify(pick))
    else window.localStorage.removeItem(key)
  } catch {
    // Storage full or blocked: the offer is a convenience, nothing else depends on it.
  }
}

/** Stores the owner's gallery pick on `page` (a family look starts or joins the offer). */
export function rememberTemplatePick(tenantId: string, page: PageId, templateId: string): void {
  writePick(tenantId, nextFamilyPick(readPick(tenantId), page, templateId, Date.now()))
}

function createFamilyBanner(page: PageId): ComponentType<SurfaceBannerProps> {
  function FamilyBanner({ api, target, isUnchanged }: SurfaceBannerProps) {
    const [offer, setOffer] = useState<FamilyOffer | null>(null)

    // Read once the editor is in the browser (storage is not there on the server).
    useEffect(() => {
      setOffer(familyOffer(readPick(target.tenantId), page, Date.now()))
    }, [target.tenantId])

    if (!offer || !isUnchanged) return null

    const answer = (isTaken: boolean) => {
      const pick = readPick(target.tenantId)
      if (pick) writePick(target.tenantId, withPageDone(pick, page))
      if (isTaken) api.replaceDesign(offer.template.build())
      setOffer(null)
    }

    return (
      <div role="status" className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-800 shadow-lg">
        <Sparkles className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <p className="min-w-0 flex-1 leading-snug">{familyOfferMessage(offer, page)}</p>
        <button type="button" onClick={() => answer(true)} className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800">
          Use it
        </button>
        <button type="button" onClick={() => answer(false)} className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100">
          No thanks
        </button>
        <button type="button" onClick={() => setOffer(null)} aria-label="Close" className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }
  FamilyBanner.displayName = `FamilyBanner(${page})`
  return FamilyBanner
}

/** One stable banner component per page (a new identity per render would remount it). */
export const FAMILY_BANNERS: Readonly<Record<PageId, ComponentType<SurfaceBannerProps>>> = {
  checkout: createFamilyBanner('checkout'),
  confirmation: createFamilyBanner('confirmation'),
  tracking: createFamilyBanner('tracking'),
}
