'use client'

import Image from 'next/image'
import {
  LayoutDashboard,
  UtensilsCrossed,
  Settings,
  LogOut,
  Store,
  ShoppingBag,
  BarChart3,
  Users,
  Ticket,
  Gift,
  Menu,
  X,
  ArrowUpRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { AdminSidebarFlags } from '@/lib/admin-sidebar-visibility'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { SmartMenuMark, SmartMenuWordmark } from '@/components/shared/smartmenu-mark'
import {
  SidebarNav,
  activeEntryLabel,
  useFilteredItems,
  useSidebarNavState,
  type SidebarEntry,
  type SidebarGroup,
  type SidebarItem,
} from '@/components/shared/sidebar-nav'

const COLLAPSED_STORAGE_KEY = 'wn-admin-sidebar-collapsed'

interface SidebarProps extends AdminSidebarFlags {
  items: SidebarEntry[]
  basePath: string
  onLogout?: () => void
  tenantName?: string
  tenantLogoUrl?: string | null
  /** The diner-facing menu, opened in a new tab. */
  storefrontHref?: string
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

function StoreAvatar({ name, logoUrl, size }: { name?: string; logoUrl?: string | null; size: number }) {
  const initial = name?.trim().charAt(0).toUpperCase() || 'S'
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-wn-coral text-[15px] font-black text-white ring-1 ring-white/10"
      style={{ width: size, height: size }}
    >
      {logoUrl ? (
        <Image src={logoUrl} alt="" width={size} height={size} unoptimized className="h-full w-full bg-white object-cover" />
      ) : (
        initial
      )}
    </span>
  )
}

/** The store this admin runs: who you are working for, and a door to its storefront. */
function StoreCard({
  tenantName,
  tenantLogoUrl,
  storefrontHref,
  isCollapsed,
}: Pick<SidebarProps, 'tenantName' | 'tenantLogoUrl' | 'storefrontHref'> & { isCollapsed: boolean }) {
  if (isCollapsed) {
    const avatar = <StoreAvatar name={tenantName} logoUrl={tenantLogoUrl} size={36} />
    return (
      <div className="flex justify-center px-3">
        {storefrontHref ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <a
                href={storefrontHref}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${tenantName ?? 'your'} storefront in a new tab`}
                className="rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-wn-amber/70"
              >
                {avatar}
              </a>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={14}>
              {tenantName} · View storefront
            </TooltipContent>
          </Tooltip>
        ) : (
          avatar
        )}
      </div>
    )
  }

  return (
    <div className="mx-3 flex items-center gap-3 rounded-xl bg-white/[0.05] p-2.5 ring-1 ring-white/[0.07]">
      <StoreAvatar name={tenantName} logoUrl={tenantLogoUrl} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold leading-tight text-white">{tenantName ?? 'Your store'}</p>
        {storefrontHref && (
          <a
            href={storefrontHref}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-0.5 rounded text-[11.5px] font-semibold text-white/50 outline-none transition-colors hover:text-wn-amber focus-visible:text-wn-amber"
          >
            View storefront
            <ArrowUpRight className="h-3 w-3" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    </div>
  )
}

function LogoutButton({ onLogout, isCollapsed, isTouch }: { onLogout: () => void; isCollapsed: boolean; isTouch?: boolean }) {
  const button = (
    <button
      type="button"
      onClick={onLogout}
      aria-label={isCollapsed ? 'Log out' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 font-semibold text-white/55 outline-none transition-colors hover:bg-white/[0.06] hover:text-[#FF9B7A] focus-visible:ring-2 focus-visible:ring-wn-amber/70',
        isTouch ? 'h-11 text-[14.5px]' : 'h-9 text-[13.5px]',
        isCollapsed && 'justify-center px-0',
      )}
    >
      <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden />
      {!isCollapsed && <span>Log out</span>}
    </button>
  )
  if (!isCollapsed) return button
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={14}>
        Log out
      </TooltipContent>
    </Tooltip>
  )
}

const NAV_SCROLL = 'min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:rgb(255_255_255/0.14)_transparent] [scrollbar-width:thin]'

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

function useStoredCollapse(): [boolean, (next: boolean) => void] {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    try {
      setIsCollapsed(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1')
    } catch {
      // Storage blocked (private mode, embedded webview): stay expanded.
    }
  }, [])

  const update = useCallback((next: boolean) => {
    setIsCollapsed(next)
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Remembering the rail is a convenience; the toggle still works.
    }
  }, [])

  return [isCollapsed, update]
}

export function Sidebar({ items, onLogout, tenantName, tenantLogoUrl, storefrontHref, ...flags }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useStoredCollapse()
  const entries = useFilteredItems(items, flags)
  const navState = useSidebarNavState(entries)
  const ToggleIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col bg-wn-ink text-white transition-[width] duration-200 ease-out md:flex',
          isCollapsed ? 'w-[76px]' : 'w-[264px]',
        )}
      >
        <div className={cn('flex h-16 shrink-0 items-center gap-2.5 px-5', isCollapsed && 'justify-center px-0')}>
          <SmartMenuMark title={isCollapsed ? 'SmartMenu' : undefined} />
          {!isCollapsed && (
            <>
              <span className="flex-1 text-[15px] font-extrabold tracking-[-0.01em]">
                <SmartMenuWordmark />
              </span>
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                aria-label="Collapse sidebar"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-wn-amber/70"
              >
                <ToggleIcon className="h-[18px] w-[18px]" />
              </button>
            </>
          )}
        </div>

        <StoreCard
          tenantName={tenantName}
          tenantLogoUrl={tenantLogoUrl}
          storefrontHref={storefrontHref}
          isCollapsed={isCollapsed}
        />

        <nav aria-label="Admin" className={cn(NAV_SCROLL, 'mt-3 px-3 pb-3')}>
          <SidebarNav
            entries={entries}
            state={navState}
            isCollapsed={isCollapsed}
            onExpandRail={() => setIsCollapsed(false)}
          />
        </nav>

        <div className="shrink-0 space-y-0.5 border-t border-white/[0.08] p-3">
          {isCollapsed && (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setIsCollapsed(false)}
                  aria-label="Expand sidebar"
                  className="flex h-9 w-full items-center justify-center rounded-lg text-white/55 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-wn-amber/70"
                >
                  <ToggleIcon className="h-[18px] w-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={14}>
                Expand sidebar
              </TooltipContent>
            </Tooltip>
          )}
          {onLogout && <LogoutButton onLogout={onLogout} isCollapsed={isCollapsed} />}
        </div>
      </aside>
    </TooltipProvider>
  )
}

// ─── Mobile Header + Drawer ───────────────────────────────────────────────────

export function MobileSidebar({ items, onLogout, tenantName, tenantLogoUrl, storefrontHref, ...flags }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const entries = useFilteredItems(items, flags)
  const navState = useSidebarNavState(entries)
  const pageTitle = activeEntryLabel(entries, navState.activeHref)

  // A tap on a link navigates; the drawer should not linger over the new page.
  useEffect(() => {
    setIsOpen(false)
  }, [navState.activeHref])

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-wn-line bg-wn-canvas/90 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-wn-canvas/75 md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open navigation menu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-wn-ink outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-wn-ink/40"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold leading-tight tracking-[-0.01em] text-wn-ink">{pageTitle}</p>
          {tenantName && <p className="truncate text-[11.5px] font-medium leading-tight text-wn-stone">{tenantName}</p>}
        </div>
        {storefrontHref && (
          <a
            href={storefrontHref}
            target="_blank"
            rel="noreferrer"
            aria-label="View storefront (opens in a new tab)"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-wn-ink outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-wn-ink/40"
          >
            <ArrowUpRight className="h-5 w-5" />
          </a>
        )}
      </header>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="left"
          hideCloseButton
          className="w-[300px] max-w-[86vw] gap-0 border-none bg-wn-ink p-0 text-white sm:max-w-[300px]"
        >
          <div className="flex h-16 shrink-0 items-center gap-2.5 pl-5 pr-3">
            <SmartMenuMark />
            <SheetTitle className="flex-1 text-[15px] font-extrabold tracking-[-0.01em] text-white">
              <SmartMenuWordmark />
            </SheetTitle>
            <SheetDescription className="sr-only">Admin navigation for {tenantName ?? 'your store'}</SheetDescription>
            <SheetClose
              aria-label="Close navigation menu"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white/60 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-wn-amber/70"
            >
              <X className="h-5 w-5" />
            </SheetClose>
          </div>

          <StoreCard tenantName={tenantName} tenantLogoUrl={tenantLogoUrl} storefrontHref={storefrontHref} isCollapsed={false} />

          <nav aria-label="Admin" className={cn(NAV_SCROLL, 'mt-3 px-3 pb-3')}>
            <SidebarNav entries={entries} state={navState} isTouch />
          </nav>

          {onLogout && (
            <div className="shrink-0 border-t border-white/[0.08] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <LogoutButton
                isTouch
                isCollapsed={false}
                onLogout={() => {
                  setIsOpen(false)
                  onLogout()
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

// ─── Predefined sidebar configuration ─────────────────────────────────────────
// Ordered by how often a merchant reaches for it: run the day, grow the
// business, then set the store up. `section` opens a labelled block.

export const adminSidebarItems: SidebarEntry[] = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Orders', href: '/admin/orders', icon: ShoppingBag },
  {
    label: 'Menu',
    icon: UtensilsCrossed,
    children: [
      { label: 'Menu Management', href: '/admin/menu' },
      { label: 'Categories', href: '/admin/categories' },
      { label: 'Add-ons', href: '/admin/addons' },
      { label: 'Inventory', href: '/admin/inventory' },
      { label: 'Transfers', href: '/admin/inventory/transfers' },
      { label: 'Stock Log', href: '/admin/inventory/log' },
      { label: 'Boost Sales', href: '/admin/boost-sales' },
    ],
  },
  { label: 'Customers', href: '/admin/customers', icon: Users, section: 'Grow' },
  { label: 'Loyalty', href: '/admin/loyalty', icon: Gift, section: 'Grow' },
  { label: 'Vouchers', href: '/admin/vouchers', icon: Ticket, section: 'Grow' },
  {
    label: 'Analytics',
    icon: BarChart3,
    section: 'Grow',
    children: [{ label: 'Product Analytics', href: '/admin/product-analytics' }],
  },
  {
    label: 'Store Setup',
    icon: Store,
    section: 'Store',
    children: [
      { label: 'Order Types', href: '/admin/order-types' },
      { label: 'Branches', href: '/admin/outlets' },
      { label: 'Staff', href: '/admin/staff' },
      { label: 'Payment Methods', href: '/admin/payment-methods' },
      { label: 'Branding Studio', href: '/admin/branding' },
      { label: 'Receipt Studio', href: '/admin/receipt-editor' },
      { label: 'QR Codes', href: '/admin/qr-codes' },
      { label: 'Hero Builder', href: '/admin/hero-designer' },
      { label: 'Connect AI', href: '/admin/mcp' },
    ],
  },
  { label: 'Settings', href: '/admin/settings', icon: Settings, section: 'Store' },
]

export const superAdminSidebarItems: SidebarEntry[] = [
  { label: 'Dashboard', href: '/superadmin', icon: LayoutDashboard },
  { label: 'Tenants', href: '/superadmin/tenants', icon: Store },
  { label: 'Settings', href: '/superadmin/settings', icon: Settings },
]

// Re-export types for consumers
export type { SidebarItem, SidebarGroup, SidebarEntry }
