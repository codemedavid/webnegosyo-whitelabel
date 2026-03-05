'use client'

import { createElement } from 'react'
import { isLucideIcon, getLucideIconName, ICON_COMPONENT_MAP } from '@/lib/category-icons'

const SIZE_MAP = {
  sm: { icon: 16, text: 'text-base' },
  md: { icon: 22, text: 'text-2xl' },
  lg: { icon: 28, text: 'text-3xl' },
} as const

interface CategoryIconProps {
  icon?: string
  color?: string
  fallbackColor?: string
  size?: keyof typeof SIZE_MAP
  className?: string
}

export function CategoryIcon({
  icon,
  color,
  fallbackColor,
  size = 'md',
  className = '',
}: CategoryIconProps) {
  if (!icon) return null

  const resolvedColor = color || fallbackColor

  if (isLucideIcon(icon)) {
    const iconName = getLucideIconName(icon)
    const IconComponent = ICON_COMPONENT_MAP[iconName]

    if (IconComponent) {
      return createElement(IconComponent, {
        size: SIZE_MAP[size].icon,
        color: resolvedColor,
        className,
      })
    }

    // Unknown Lucide icon name — render nothing rather than error
    return null
  }

  // Emoji fallback
  return (
    <span className={`${SIZE_MAP[size].text} ${className}`} role="img">
      {icon}
    </span>
  )
}
