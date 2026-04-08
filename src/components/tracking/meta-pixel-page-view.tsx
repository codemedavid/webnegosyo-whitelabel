'use client'

import { useEffect } from 'react'
import { initMetaPixel } from '@/lib/meta-pixel'

interface MetaPixelPageViewProps {
  pixelId?: string
}

export function MetaPixelPageView({ pixelId }: MetaPixelPageViewProps) {
  useEffect(() => {
    if (!pixelId) return
    initMetaPixel(pixelId)
  }, [pixelId])

  return null
}
