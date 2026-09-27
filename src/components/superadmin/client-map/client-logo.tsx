'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { initialsOf } from '@/lib/superadmin/client-map/display'
import { logoThumbUrl } from './marker-elements'

interface ClientLogoProps {
  name: string
  logoUrl: string | null
  color: string
  /** Rendered size in CSS px; the thumbnail is fetched at 2x. */
  size: number
  className?: string
}

export function ClientLogo({ name, logoUrl, color, size, className }: ClientLogoProps) {
  const [hasFailed, setHasFailed] = useState(false)
  const src = hasFailed ? null : logoThumbUrl(logoUrl, size * 2)

  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-neutral-950', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny ImageKit thumbnail, already transformed
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setHasFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-semibold text-white"
          style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color} 70%, #000), #111)` }}
        >
          {initialsOf(name)}
        </span>
      )}
    </div>
  )
}
