'use client'

import Link from 'next/link'
import { House, LayoutGrid, ShoppingBag, type LucideIcon } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { useStorefrontRuntime } from '../../runtime/storefront-runtime'
import { useBiteSpeedRoutes, useOrderAction } from './parts'

export type BiteSpeedPage = 'home' | 'menu'

/** Height of the phone tab bar; reserved with StorefrontBottomInset. */
export const BITESPEED_TAB_BAR_PX = 72

function Brand() {
  const { menu, branding } = useStorefrontRuntime()
  const routes = useBiteSpeedRoutes()
  const name = menu.tenant?.name ?? ''
  return (
    <Link href={routes.home} className="flex min-w-0 items-center gap-2.5" aria-label={`${name} home`}>
      {branding.logoUrl && (
        <OptimizedImage src={branding.logoUrl} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full object-cover" />
      )}
      <span className="truncate text-xl font-bold tracking-[-0.01em] text-[var(--bs-accent-ink)]" style={{ fontFamily: 'var(--bs-font-display)' }}>
        {name}
      </span>
    </Link>
  )
}

function OrderCount() {
  const { itemCount } = useStorefrontRuntime().menu
  return <span className="tabular-nums">{itemCount}</span>
}

/** Sticky top bar: brand, page links on desktop, and the order button. */
export function BiteSpeedHeader({ active }: { active: BiteSpeedPage }) {
  const routes = useBiteSpeedRoutes()
  const onOrder = useOrderAction()
  const { isCheckoutPending } = useStorefrontRuntime()
  const linkClass = (page: BiteSpeedPage) =>
    `text-lg font-semibold transition-colors hover:text-[var(--bs-accent)] ${active === page ? 'text-[var(--bs-accent-ink)]' : 'text-[var(--bs-text-muted)]'}`

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--bs-outline)]/40 bg-[var(--bs-bg)]/90 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <Brand />
        <nav aria-label="Main" className="hidden items-center gap-8 md:flex" style={{ fontFamily: 'var(--bs-font-display)' }}>
          <Link href={routes.home} className={linkClass('home')} aria-current={active === 'home' ? 'page' : undefined}>Home</Link>
          <Link href={routes.menu} className={linkClass('menu')} aria-current={active === 'menu' ? 'page' : undefined}>Menu</Link>
        </nav>
        <button
          type="button"
          onClick={onOrder}
          disabled={isCheckoutPending}
          aria-label="View order"
          className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-[var(--bs-accent)] px-4 text-sm font-bold text-[var(--bs-on-accent)] shadow-sm transition-transform active:scale-95 disabled:opacity-60"
        >
          <ShoppingBag className="h-5 w-5" aria-hidden />
          {/* Phones have the tab bar's Order tab, so the header keeps just the count. */}
          <span><span className="hidden sm:inline">Order </span>(<OrderCount />)</span>
        </button>
      </div>
    </header>
  )
}

interface TabProps {
  label: string
  icon: LucideIcon
  isActive?: boolean
  href?: string
  onClick?: () => void
  badge?: number
}

function Tab({ label, icon: Icon, isActive, href, onClick, badge }: TabProps) {
  const className = `relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold tracking-[0.04em] transition-transform active:scale-90 ${
    isActive ? 'text-[var(--bs-accent-ink)]' : 'text-[var(--bs-text-muted)]'
  }`
  const content = (
    <>
      <span className="relative">
        <Icon className="h-6 w-6" aria-hidden />
        {badge ? (
          <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-[var(--bs-accent)] px-1 text-center text-[10px] leading-[18px] text-[var(--bs-on-accent)] tabular-nums">
            {badge}
          </span>
        ) : null}
      </span>
      {label}
    </>
  )
  if (href) {
    return <Link href={href} className={className} aria-current={isActive ? 'page' : undefined}>{content}</Link>
  }
  return <button type="button" onClick={onClick} className={className}>{content}</button>
}

/** Phone-only tab bar pinned to the bottom of the screen. */
export function BiteSpeedTabBar({ active }: { active: BiteSpeedPage }) {
  const routes = useBiteSpeedRoutes()
  const onOrder = useOrderAction()
  const { itemCount } = useStorefrontRuntime().menu
  return (
    <nav
      aria-label="Quick links"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center rounded-t-[var(--bs-radius)] bg-[var(--bs-bg)]/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur-lg md:hidden"
      style={{ height: BITESPEED_TAB_BAR_PX }}
    >
      <Tab label="Home" icon={House} href={routes.home} isActive={active === 'home'} />
      <Tab label="Menu" icon={LayoutGrid} href={routes.menu} isActive={active === 'menu'} />
      <Tab label="Order" icon={ShoppingBag} onClick={onOrder} badge={itemCount} />
    </nav>
  )
}
