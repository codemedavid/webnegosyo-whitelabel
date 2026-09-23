'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** How long a click-driven smooth scroll is allowed to settle before spying resumes. */
const CLICK_SCROLL_SETTLE_MS = 900

/** DOM id of a category section, shared by every scroll-based layout. */
export function categorySectionId(categoryId: string): string {
  return `category-${categoryId}`
}

/**
 * Scroll-spy for layouts that render every category on one long page.
 * Tracks which `#category-<id>` section sits in the upper part of the
 * viewport and scrolls to one on demand. Sections carry their own
 * `scroll-margin-top`, so a jump lands below whatever sticky bars exist.
 */
export function useCategoryScrollSpy(categoryIds: readonly string[]) {
  const [activeId, setActiveId] = useState<string | null>(categoryIds[0] ?? null)
  const isClickScrolling = useRef(false)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idsKey = categoryIds.join('|')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrolling.current) return
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length === 0) return
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b))
        setActiveId(topMost.target.id.replace(/^category-/, ''))
      },
      { rootMargin: '-25% 0px -60% 0px', threshold: 0 }
    )
    for (const id of idsKey.split('|').filter(Boolean)) {
      const el = document.getElementById(categorySectionId(id))
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [idsKey])

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
  }, [])

  const scrollToCategory = useCallback((categoryId: string) => {
    const el = document.getElementById(categorySectionId(categoryId))
    if (!el) return
    isClickScrolling.current = true
    setActiveId(categoryId)
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      isClickScrolling.current = false
    }, CLICK_SCROLL_SETTLE_MS)
  }, [])

  // The category set can change under us (a search narrows it); never report
  // a section that is no longer on the page.
  const currentId = activeId && categoryIds.includes(activeId) ? activeId : (categoryIds[0] ?? null)
  return { activeId: currentId, scrollToCategory }
}
