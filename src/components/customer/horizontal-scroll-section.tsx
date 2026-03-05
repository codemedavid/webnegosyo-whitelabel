'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MenuItemCard } from './menu-item-card'
import type { MenuItem } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { CardTemplate } from '@/lib/card-templates'

interface HorizontalScrollSectionProps {
  items: MenuItem[]
  onItemSelect: (item: MenuItem) => void
  branding: BrandingColors
  template?: CardTemplate
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

export function HorizontalScrollSection({
  items,
  onItemSelect,
  branding,
  template = 'classic',
  menuEngineeringEnabled,
  hideCurrencySymbol,
}: HorizontalScrollSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    updateScrollState()

    el.addEventListener('scroll', updateScrollState, { passive: true })

    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', updateScrollState)
      observer.disconnect()
    }
  }, [updateScrollState])

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const scrollAmount = el.clientWidth * 0.75
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  return (
    <div className="relative group/scroll">
      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 items-stretch"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="w-[160px] md:w-[200px] lg:w-[220px] shrink-0 snap-start h-full"
          >
            <MenuItemCard
              item={item}
              onSelect={onItemSelect}
              branding={branding}
              template={template}
              menuEngineeringEnabled={menuEngineeringEnabled}
              hideCurrencySymbol={hideCurrencySymbol}
            />
          </div>
        ))}
      </div>

      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 hidden md:group-hover/scroll:flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg border border-gray-200 transition-opacity hover:bg-white"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-5 w-5 text-gray-700" />
        </button>
      )}

      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 hidden md:group-hover/scroll:flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg border border-gray-200 transition-opacity hover:bg-white"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-5 w-5 text-gray-700" />
        </button>
      )}
    </div>
  )
}
