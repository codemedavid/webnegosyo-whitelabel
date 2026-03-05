'use client'

import { createElement, useState, useMemo } from 'react'
import { Search, X, Smile } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategoryIcon } from '@/components/shared/category-icon'
import {
  CURATED_ICON_GROUPS,
  ALL_CURATED_ICONS,
  ICON_COMPONENT_MAP,
  toLucideIconString,
  isLucideIcon,
} from '@/lib/category-icons'

interface IconPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  color: string
  fallbackColor: string
  onSelect: (icon: string, color: string) => void
}

const GROUP_LABELS = ['All', ...CURATED_ICON_GROUPS.map((g) => g.label)]

export function IconPicker({
  open,
  onOpenChange,
  value,
  color,
  fallbackColor,
  onSelect,
}: IconPickerProps) {
  const [search, setSearch] = useState('')
  const [selectedIcon, setSelectedIcon] = useState(value)
  const [selectedColor, setSelectedColor] = useState(color)
  const [activeGroup, setActiveGroup] = useState('All')
  const [showEmoji, setShowEmoji] = useState(false)
  const [emojiInput, setEmojiInput] = useState(
    value && !isLucideIcon(value) ? value : ''
  )

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setSelectedIcon(value)
      setSelectedColor(color)
      setEmojiInput(value && !isLucideIcon(value) ? value : '')
      setShowEmoji(value ? !isLucideIcon(value) : false)
      setSearch('')
      setActiveGroup('All')
    }
    onOpenChange(isOpen)
  }

  const visibleIcons = useMemo(() => {
    let icons = activeGroup === 'All'
      ? ALL_CURATED_ICONS
      : CURATED_ICON_GROUPS.find((g) => g.label === activeGroup)?.icons ?? []

    if (search.trim()) {
      const q = search.toLowerCase()
      icons = icons.filter((n) => n.includes(q))
    }

    return icons
  }, [search, activeGroup])

  const selectLucideIcon = (name: string) => {
    setSelectedIcon(toLucideIconString(name))
    setEmojiInput('')
    setShowEmoji(false)
  }

  const handleConfirm = () => {
    onSelect(selectedIcon, selectedColor)
    onOpenChange(false)
  }

  const resolvedColor = selectedColor || fallbackColor

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Choose Icon</DialogTitle>
        </DialogHeader>

        {/* Top bar: preview + color + actions */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border"
            style={{
              backgroundColor: `${resolvedColor}12`,
              borderColor: `${resolvedColor}30`,
            }}
          >
            {selectedIcon ? (
              <CategoryIcon icon={selectedIcon} color={resolvedColor} size="md" />
            ) : (
              <span className="text-muted-foreground text-lg">?</span>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={selectedColor || fallbackColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="h-6 w-6 shrink-0 cursor-pointer rounded border border-gray-200 p-0"
              />
              <Input
                value={selectedColor}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '' || /^#([A-Fa-f0-9]{0,6})$/.test(v)) {
                    setSelectedColor(v)
                  }
                }}
                placeholder="Brand default"
                className="font-mono text-xs h-6 px-2 flex-1 min-w-0"
                maxLength={7}
              />
              {selectedColor && (
                <button
                  type="button"
                  onClick={() => setSelectedColor('')}
                  className="text-[11px] text-blue-600 hover:text-blue-700 shrink-0"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {selectedIcon && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => { setSelectedIcon(''); setEmojiInput('') }}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2 px-4 pb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search icons..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowEmoji(false) }}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
              showEmoji ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
            title="Use emoji instead"
          >
            <Smile className="h-4 w-4" />
          </button>
        </div>

        {showEmoji ? (
          /* Emoji input */
          <div className="px-4 pb-4 pt-1">
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
              <p className="text-xs text-muted-foreground mb-3">
                Type or paste an emoji
              </p>
              <Input
                placeholder="🍕"
                value={emojiInput}
                onChange={(e) => { setEmojiInput(e.target.value); setSelectedIcon(e.target.value) }}
                className="text-3xl text-center h-16 max-w-[120px] mx-auto"
                maxLength={4}
                autoFocus
              />
            </div>
          </div>
        ) : (
          <>
            {/* Group filter chips */}
            <div className="flex gap-1 px-4 pb-2 overflow-x-auto scrollbar-hide">
              {GROUP_LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveGroup(label)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    activeGroup === label
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Icon grid */}
            <div className="overflow-y-auto px-3 pb-3 pt-1" style={{ maxHeight: '280px' }}>
              {visibleIcons.length > 0 ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: '6px',
                  }}
                >
                  {visibleIcons.map((name) => {
                    const isSelected = selectedIcon === toLucideIconString(name)
                    const IconComp = ICON_COMPONENT_MAP[name]
                    if (!IconComp) return null
                    return (
                      <button
                        key={name}
                        type="button"
                        title={name.replace(/-/g, ' ')}
                        onClick={() => selectLucideIcon(name)}
                        style={{
                          aspectRatio: '1',
                          backgroundColor: isSelected ? resolvedColor : undefined,
                          borderColor: isSelected ? resolvedColor : undefined,
                        }}
                        className={`flex items-center justify-center rounded-lg border transition-all ${
                          isSelected
                            ? 'text-white shadow-sm scale-105'
                            : 'border-gray-100 bg-gray-50 hover:bg-gray-100 hover:border-gray-200 hover:scale-105'
                        }`}
                      >
                        {createElement(IconComp, {
                          size: 20,
                          ...(isSelected ? { color: 'white' } : { color: resolvedColor }),
                        })}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Search className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No icons match &ldquo;{search}&rdquo;</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-gray-50/50">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
