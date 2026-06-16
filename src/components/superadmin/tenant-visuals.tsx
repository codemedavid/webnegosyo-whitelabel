import type { ReactNode } from 'react'
import Image from 'next/image'
import {
  Boxes,
  Smartphone,
  Truck,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* =============================================================================
   Shared tenant visuals for the superadmin tenant surfaces.

   Server-compatible (no hooks) so both the client list and the server-rendered
   detail header can render identical monograms + feature chips.
   ========================================================================== */

interface MinimalTenant {
  name: string
  logo_url?: string | null
  primary_color?: string | null
  menu_engineering_enabled?: boolean
  bundles_enabled?: boolean
  app_enabled?: boolean
  lalamove_enabled?: boolean
}

/** Pull the first 1-2 meaningful letters from a tenant name. */
function getMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Decide readable foreground (black/white) against a hex background. */
function readableText(hex?: string | null): string {
  if (!hex) return '#ffffff'
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  if (full.length !== 6) return '#ffffff'
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  // Relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#000000' : '#ffffff'
}

const SIZE_MAP = {
  sm: { box: 'h-10 w-10 rounded-xl text-[13px]', img: 40 },
  md: { box: 'h-12 w-12 rounded-xl text-base', img: 48 },
  lg: { box: 'h-16 w-16 rounded-2xl text-xl', img: 64 },
} as const

/** Logo (if present) or a colored monogram tile derived from the tenant brand. */
export function TenantMonogram({
  tenant,
  size = 'md',
  className,
}: {
  tenant: MinimalTenant
  size?: keyof typeof SIZE_MAP
  className?: string
}) {
  const { box, img } = SIZE_MAP[size]

  if (tenant.logo_url) {
    return (
      <div
        className={cn(
          'relative shrink-0 overflow-hidden border border-white/10 bg-white/[0.04]',
          box,
          className,
        )}
      >
        <Image
          src={tenant.logo_url}
          alt=""
          fill
          sizes={`${img}px`}
          className="object-cover"
          unoptimized
        />
      </div>
    )
  }

  const bg = tenant.primary_color || '#1f1f1f'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center border border-white/10 font-semibold tracking-tight',
        box,
        className,
      )}
      style={{ backgroundColor: bg, color: readableText(bg) }}
      aria-hidden
    >
      {getMonogram(tenant.name)}
    </div>
  )
}

interface FeatureDef {
  key: keyof MinimalTenant
  label: string
  short: string
  icon: LucideIcon
}

const FEATURES: FeatureDef[] = [
  { key: 'menu_engineering_enabled', label: 'Menu Engineering', short: 'Menu Eng', icon: TrendingUp },
  { key: 'bundles_enabled', label: 'Bundles', short: 'Bundles', icon: Boxes },
  { key: 'app_enabled', label: 'Mobile App', short: 'App', icon: Smartphone },
  { key: 'lalamove_enabled', label: 'Lalamove Delivery', short: 'Lalamove', icon: Truck },
]

/** Small monochrome capability chips for the enabled feature flags. */
export function TenantFeatureChips({
  tenant,
  size = 'sm',
  className,
}: {
  tenant: MinimalTenant
  size?: 'sm' | 'md'
  className?: string
}) {
  const enabled = FEATURES.filter((f) => Boolean(tenant[f.key]))
  if (enabled.length === 0) {
    return (
      <span className="text-xs text-white/35">No features enabled</span>
    )
  }

  const pad = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'
  const iconSize = size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {enabled.map(({ key, label, short, icon: Icon }) => (
        <span
          key={String(key)}
          title={label}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] font-medium text-white/60',
            pad,
          )}
        >
          <Icon className={iconSize} />
          {size === 'md' ? label : short}
        </span>
      ))}
    </div>
  )
}

/** Count of enabled features — used for compact summaries. */
export function countEnabledFeatures(tenant: MinimalTenant): number {
  return FEATURES.reduce((n, f) => n + (tenant[f.key] ? 1 : 0), 0)
}

/** A tiny labeled stat used in the detail header meta row. */
export function MetaItem({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon
  children: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-white/55">
      {Icon ? <Icon className="h-3.5 w-3.5 text-white/35" /> : null}
      {children}
    </span>
  )
}

/* =============================================================================
   Order-recency helpers — used by tenant list rows and the detail header to
   surface how "alive" a tenant is. Server-compatible (no hooks).
   ========================================================================== */

const MS_PER_DAY = 86400000

/**
 * Compact relative-time label for the last-order timestamp.
 * Returns '—' when null, otherwise 'today' | 'Nd ago' | 'Nw ago' | 'Nmo ago' |
 * 'Ny ago'.
 */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'

  const days = Math.floor((Date.now() - then) / MS_PER_DAY)
  if (days <= 0) return 'today'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

/**
 * A small colored dot signalling tenant order-recency health:
 * null → muted white; <=7d → emerald; <=30d → amber; else → red.
 */
export function TenantHealthDot({
  lastOrderAt,
  className,
}: {
  lastOrderAt: string | null
  className?: string
}) {
  let color = 'bg-white/30'
  let label = 'No orders yet'

  if (lastOrderAt) {
    const then = new Date(lastOrderAt).getTime()
    if (!Number.isNaN(then)) {
      const days = Math.floor((Date.now() - then) / MS_PER_DAY)
      label = `Active ${formatRelativeTime(lastOrderAt)}`
      if (days <= 7) color = 'bg-emerald-400'
      else if (days <= 30) color = 'bg-amber-400'
      else color = 'bg-red-400'
    }
  }

  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', color, className)}
      title={label}
      aria-label={label}
    />
  )
}
