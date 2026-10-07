'use client'

import { createContext, useCallback, useContext, type MouseEvent } from 'react'

import { isInStoreTarget, parseLinkTarget, targetElementId, type InStoreLinkTarget } from '@/lib/hero-builder/link-target'

/**
 * Follows an in-store hero link (menu, category, product, section). Returns
 * true when it handled the click. The storefront provides one wired to its
 * menu controller; without a provider (editor, template gallery) links fall
 * back to scrolling to a matching element.
 */
export type HeroLinkHandler = (target: InStoreLinkTarget) => boolean

const HeroLinkContext = createContext<HeroLinkHandler | null>(null)

export const HeroLinkProvider = HeroLinkContext.Provider

function isModifiedClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}

function scrollToElement(target: InStoreLinkTarget): boolean {
  const id = targetElementId(target)
  const element = id ? document.getElementById(id) : null
  if (!element) return false
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}

/** Click handler for every hero link: in-store targets never leave the page. */
export function useHeroLinkClick(): (event: MouseEvent<HTMLAnchorElement>) => void {
  const handler = useContext(HeroLinkContext)
  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || isModifiedClick(event)) return
      const target = parseLinkTarget(event.currentTarget.getAttribute('href'))
      if (!isInStoreTarget(target)) return
      if (handler?.(target) || scrollToElement(target)) event.preventDefault()
    },
    [handler],
  )
}
