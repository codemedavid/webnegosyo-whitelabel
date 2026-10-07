'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { toast } from 'sonner'

import type { HeroLinkHandler } from '@/components/hero-builder/renderer/link-context'
import { categorySectionId } from '@/hooks/use-category-scroll-spy'
import type { StorefrontMenuController } from '../contracts'
import { planStoreLink } from './store-link-plan'

const MISSING_PRODUCT_MESSAGE = 'That item isn’t on the menu right now'

function scrollIntoView(element: Element | null | undefined): void {
  element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Follows hero links to the menu, a category or a product through the menu
 * controller, so they work on every page layout — including tabbed ones that
 * render a single category and no per-category anchors.
 */
export function useStoreLinkNavigation(
  menu: StorefrontMenuController,
  menuRootRef: RefObject<HTMLElement | null>,
): HeroLinkHandler {
  const { categoriesWithBundles, allMenuItems, setActiveCategory, setSearchQuery, selectItem } = menu
  const frameRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
  }, [])

  return useCallback((target) => {
    const scrollToMenu = () => scrollIntoView(menuRootRef.current)
    const plan = planStoreLink(target, {
      hasElement: (id) => document.getElementById(id) !== null,
      categoryIds: categoriesWithBundles.map((category) => category.id),
      items: allMenuItems,
    })

    switch (plan.kind) {
      case 'scroll-menu':
        scrollToMenu()
        return true
      case 'scroll-to':
        scrollIntoView(document.getElementById(plan.elementId))
        return true
      case 'show-category':
        setSearchQuery('')
        setActiveCategory(plan.categoryId)
        // Wait for the category to render, then land on its section when the
        // layout has one, else on the top of the (now filtered) menu.
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null
            scrollIntoView(document.getElementById(categorySectionId(plan.categoryId)) ?? menuRootRef.current)
          })
        })
        return true
      case 'open-product':
        selectItem(plan.item)
        return true
      case 'missing-product':
        toast.error(MISSING_PRODUCT_MESSAGE)
        scrollToMenu()
        return true
      case 'ignore':
        return false
    }
  }, [allMenuItems, categoriesWithBundles, menuRootRef, selectItem, setActiveCategory, setSearchQuery])
}
