'use client'

import { memo, useMemo, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { BrandingColors } from '@/lib/branding-utils'
import { setAlpha } from '@/lib/branding-utils'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  branding?: BrandingColors
}

export const SearchBar = memo(function SearchBar({ value, onChange, placeholder = 'Search menu...', branding }: SearchBarProps) {
  // Memoize alpha-computed colors so setAlpha is not called on every keystroke
  const brandedStyles = useMemo(() => {
    if (!branding) return null
    return {
      backgroundColor: setAlpha(branding.cards, 0.8),
      ringColor: setAlpha(branding.primary, 0.2),
      focusBorderColor: setAlpha(branding.primary, 0.6),
    }
  }, [branding])

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    if (brandedStyles) {
      e.currentTarget.style.borderColor = brandedStyles.focusBorderColor
    }
  }, [brandedStyles])

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    if (branding) {
      e.currentTarget.style.borderColor = branding.border
    }
  }, [branding])

  if (branding && brandedStyles) {
    return (
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
          style={{ color: branding.textMuted }}
        />
        {/* Fix: Use CSS custom property via inline style instead of a dynamic <style> block.
            Previously, branding.textMuted was interpolated directly into a <style> tag which
            is an XSS vector — a malicious value could break out of the CSS context and inject
            HTML. CSS custom properties set via the style prop are safe: the browser treats
            them as opaque strings and never parses them as markup or CSS selectors. */}
        <Input
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-12 pr-12 h-12 rounded-full backdrop-blur-sm border focus:ring-2 focus:outline-none branded-search-input"
          style={{
            borderColor: branding.border,
            backgroundColor: brandedStyles.backgroundColor,
            color: branding.textPrimary,
            // @ts-expect-error -- CSS custom properties for theming via inline style
            '--tw-ring-color': brandedStyles.ringColor,
            '--branded-placeholder-color': branding.textMuted,
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {value && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
            style={{ color: branding.textSecondary }}
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
