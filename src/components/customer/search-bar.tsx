'use client'

import { memo, useMemo, useCallback } from 'react'
import { Search, X, Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { BrandingColors } from '@/lib/branding-utils'
import { setAlpha } from '@/lib/branding-utils'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  branding?: BrandingColors
  isBrandAdmin?: boolean
  onEditBrandingSection?: () => void
}

const RADIUS_CLASS: Record<'pill' | 'rounded' | 'square', string> = {
  pill: 'rounded-full',
  rounded: 'rounded-lg',
  square: 'rounded-none',
}

export const SearchBar = memo(function SearchBar({
  value,
  onChange,
  placeholder = 'Search menu...',
  branding,
  isBrandAdmin = false,
  onEditBrandingSection,
}: SearchBarProps) {
  const cfg = branding?.searchBar

  const resolved = useMemo(() => {
    if (!branding) return null
    const fallbackBg = setAlpha(branding.cards, 0.8)
    const ring = cfg?.focusRing || setAlpha(branding.primary, 0.2)
    const borderColor = cfg?.border || branding.border
    const isOutline = cfg?.style === 'outline'
    const isGhost = cfg?.style === 'ghost'
    return {
      bg: isOutline ? 'transparent' : (cfg?.background || fallbackBg),
      text: cfg?.text || branding.textPrimary,
      placeholder: cfg?.placeholder || branding.textMuted,
      icon: cfg?.icon || branding.textMuted,
      border: isGhost ? 'transparent' : borderColor,
      ring,
      radius: RADIUS_CLASS[cfg?.radius || 'pill'],
      focusBorderColor: setAlpha(branding.primary, 0.6),
    }
  }, [branding, cfg])

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    if (resolved) e.currentTarget.style.borderColor = resolved.focusBorderColor
  }, [resolved])

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    if (resolved) e.currentTarget.style.borderColor = resolved.border
  }, [resolved])

  const adminPencil = isBrandAdmin && onEditBrandingSection ? (
    <button
      type="button"
      onClick={onEditBrandingSection}
      title="Edit search bar"
      aria-label="Edit search bar"
      className="absolute -right-1 -top-1 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  ) : null

  if (branding && resolved) {
    return (
      <div className="relative">
        {adminPencil}
        <Search
          className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
          style={{ color: resolved.icon }}
        />
        <Input
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`pl-12 pr-12 h-12 ${resolved.radius} backdrop-blur-sm border focus:ring-2 focus:outline-none branded-search-input`}
          style={{
            borderColor: resolved.border,
            backgroundColor: resolved.bg,
            color: resolved.text,
            // @ts-expect-error -- CSS custom properties for theming via inline style
            '--tw-ring-color': resolved.ring,
            '--branded-placeholder-color': resolved.placeholder,
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {value && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
            style={{ color: resolved.icon }}
            onClick={() => onChange('')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      {adminPencil}
      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-12 pr-12 h-12 rounded-full border-gray-200 bg-white/80 backdrop-blur-sm focus:border-orange-300 focus:ring-orange-200"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full hover:bg-gray-100"
          onClick={() => onChange('')}
        >
          <X className="h-4 w-4 text-gray-400" />
        </Button>
      )}
    </div>
  )
})
