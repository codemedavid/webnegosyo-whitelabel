import Image from 'next/image'
import { cn } from '@/lib/utils'

interface SmartMenuMarkProps {
  className?: string
  /** Accessible name; omit when a visible wordmark sits next to it. */
  title?: string
}

/**
 * The SmartMenu "SM" monogram, cropped from public/landing/smartmenu-logo.png
 * (the full badge's tagline is illegible at rail size). Its white ground is
 * clipped to a circle so it sits on the ink rail like the landing nav badge.
 */
export function SmartMenuMark({ className, title }: SmartMenuMarkProps) {
  return (
    <Image
      src="/smartmenu-mark.png"
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      width={32}
      height={32}
      className={cn('h-8 w-8 shrink-0 rounded-full bg-white', className)}
      priority
    />
  )
}

/** "Smart" + amber "Menu", matching the landing footer on a dark ground. */
export function SmartMenuWordmark() {
  return (
    <>
      Smart<span className="text-wn-amber">Menu</span>
    </>
  )
}
